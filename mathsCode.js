<!DOCTYPE HTML>
<html>
<div id="output"></div>
<script>
var interPolator = (function(){
	var input;
	var output;
	var maxDistance;
	
	var parseGcode = function (){
		var curPos = {x:0, y:0, z:0};
		var lastCommand = '';
		var feedrate = 0;
		var newGCode = [];
		var command = new RegExp("(G\\s*(0|1|2|3)+)",'i');
		var coord = {	x:	new RegExp("X\\s*(\\d+)",'i'),
						y:  new RegExp("Y\\s*(\\d+)",'i'),
						z:	new RegExp("Z\\s*(\\d+)",'i')
		};
		var offset = {	i: new RegExp("I\\s*(\\d+)",'i'),
						j: new RegExp("J\\s*(\\d+)",'i'),
						k: new RegExp("K\\s*(\\d+)",'i')
		};
		var feedrate = new RegExp("F\\s*(\\d+)",'i');
		var radius = new RegExp("R\\s*(\\d+)",'i');
		var comment = new RegExp("(\\(.*?\\))");
		var lineNumber = new RegExp("N\\s*\\d*","i");
		var end = {};
		this.input.forEach(function(elem){
			var result;
			var comments;
			elem = elem.replace(ignore, '');
			elem = elem.trim();
			elem = elem.replace(lineNumber,'');
			var hasFeedrate = false;
			var hasCommand = false;
			var hasComment = false;
			if(comment.test(elem)){
				var counter = 1;
				var _comments = comment.exec(elem);
				do{
					comments.push(_comments[1]);
					elem.replace(comment, '^'+ counter);
					counter++;
					_comments = comment.exec(elem);
				} while (_comments);
			}
			if(command.test(elem)){
				result = command.exec(elem);
				//get rid of intermediate spaces
				result = result.replace(' ', '');
				lastCommand = result[1].toUpperCase();
				hasCommand=true;
			}
			if(feedrate.test(elem)){
				result = feedrate.exec(elem);
				feedrate = makeNumeric(elem[1]);
				hasFeedrate = true;
			}
			var hasCoords = false;
			var clockwise = false;
			switch(lastCommand){
				case 'G0':
				case 'G00':
				case 'G1':
				case 'G01':
					['x','y','z'].forEach(function(e,index, that){
						if(coord[e].test(elem)){
							var result = coord[e].exec(elem);
							end[e] = that.makeNumeric(result[1]);
							hasCoords = true;
						} else {
							end[e] = that.curPos[e];
						}
					}, this);
					if(hasCoords){
						var rValue = this.interpolateLine(curPos, end, feedrate);
						if(rValue === false){
							this.output.push(elem);
						} else{
							for(var i = 0; i <rValue.length; i++){
								if(hasCommand && i == 0){
									var item = lastCommand + " " + rValue[i];
								} else {
									var item = rValue[i];
								}
								if(hasFeedrate){
									item = item + " F" + feedrate;
								}
								this.output.push(item);
							}
						}
					} else{
						this.output.push(elem);
					}
					curPos = end;
					end = {};
					break;
				
				case 'G2':
				case 'G02':
					var clockwise = true;
				case 'G3':
				case 'G03':
					['x','y','z'].forEach(function(e,index, that){
						if(coord[e].test(elem)){
							var result = coord[e].exec(elem);
							end[e] = that.makeNumeric(result[1]);
							hasCoords = true;
						} else {
							end[e] = that.curPos[e];
						}
					}, this);
					
					if(!hasCoords){
						this.output.push(elem);
					} else {
						var hasOffset = false;
						['i','j','k'].forEach(function(e,index, that){
							if(offset[e].test(elem)){
								var result = offset[e].exec(elem);
								offset[e] = that.makeNumeric(result[1]);
								hasOffset = true;
							} 
						}, this);
						
						if(!hasOffset){
							if(radius.test(elem)){
								var rr = radius.exec(elem);
							} else {
								this.output.push(elem); //don't know what to do so give up
							}
						} else {
							var rValue = this.interpolateArc(curPos, end, offset, clockwise);
							rValue.forEach(function(elem, that){
								that.output.push(elem);
							}, this);
							
						}
					}
				break;
			}
				
		});
	};
	
	var interpolateLine: function(start, end){
		var returnArray = [];
		var max
		['x','y','z'].forEach(function(elem, index, that){
			if(typeof end[elem] === "undefined"){
				end[elem] = start[elem];
			} else {
				end[elem] = that.makeNumeric(end[elem]);
			}
		}, this);
		
		var distance = Math.sqrt(Math.pow(end.x - start.x,2) + Math.pow(end.y-start.y,2));
		
		if(distance > maxDistance){
			var intermediateSteps  = Math.floor(distance/this.maxDistance);	
			for(var i = 0; i<intermediateSteps; i++){
				['x','y','z'].forEach(function(elem){
					var newVal = start.x + ((i+1) * (end.x - start.x)/intermediateSteps);
					returnArray[i] = returnArray[i] + elem + (newVal).toFixed(4) + " ");
				});
				returnArray[i] = returnArray[i] + " (added by line interpolator)";
			};
			return returnArray;
		} else {
			return false;
		}
	};
	
	var	interpolateArc: function(start, end, offset, clockwise = true){
		['x','y','z'].forEach(function(elem, index, that){
			if(typeof end[elem] === "undefined"){
				end[elem] = start[elem];
			} else {
				end[elem] = that.makeNumeric(end[elem]);
			}
		}, this);
		
		
		var returnArray = [];
		var origin = {	x:	start.x + offset.i,
						y:	start.y + offset.j,
						z:	start.z + offset.k };
		
		var radius = Math.sqrt( (offset.i * offset.i) + (offset.j * offset.j) );
		if(origin.z != 0) return end;
		var circumference = Math.PI * 2 * radius;
		console.log("circumference", circumference);
		var chordLength = Math.sqrt(Math.pow(end.x-start.x,2) + Math.pow(end.y - start.y,2));
		console.log("chord length", chordLength);
		var segmentAngle = 2 * (Math.asin(chordLength/(2 * radius)));
		console.log("segment angle", segmentAngle);
		var arcLength = circumference * segmentAngle/(2 * Math.PI);
		console.log("Arc Length", arcLength);
		if(arcLength > maxDistance){
			var intermediateSteps = Math.floor(arcLength/maxDistance);
			//we need the angle from the vertical
			var topPosition = {x: origin.x, y: origin.y + radius};
			console.log("top position", topPosition);
			var topChordLength = Math.sqrt(Math.pow(topPosition.x - start.x,2) + Math.pow(topPosition.y - start.y,2));
			console.log("top Chord length", topChordLength);
			var topAngle = 2 * Math.asin(topChordLength/(2 * radius));
			console.log("top angle", topAngle);
			if(clockwise){
					for(var j =0; j<intermediateSteps; j++){
						var angle = topAngle + ((j + 1) * segmentAngle/intermediateSteps);
						console.log("segment angle", angle);
						var x = origin.x + radius * Math.sin(angle);	
						var y = origin.y + radius * Math.cos(angle);	
						if(end.z){
							returnArray.push("G2 X" + x + " Y" + y + " Z" + end.z + " R" + radius + " (added by arc interpolator)");
						}else{
							returnArray.push("G2 X" + x + " Y" + y + " R" + radius + " (added by arc interpolator)");
						}
					}
			} else {
					for(var j =0; j<intermediateSteps; j++){
						var angle = topAngle - ((j + 1) * segmentAngle/intermediateSteps);
						console.log("segment angle", angle);
						var x = origin.x + radius * Math.sin(angle);	
						var y = origin.y + radius * Math.cos(angle);	
						console.log("coords", "G3 X" + x + " Y" + y);
						if(end.z){
							returnArray.push("G3 X" + x + " Y" + y + " Z" + end.z + " R" + radius + " (added by arc interpolator)");
						}else{
							returnArray.push("G3 X" + x + " Y" + y + " R" + radius + " (added by arc interpolator)");
						}
					}
			}
			return returnArray;
		}
		return false;
	};
	
	var makeNumeric : function(variable){
		if(typeof variable == "number") return variable;
		if(isNaN(variable)) return false;
		return parseFloat(variable);
	}
	
	return {
		interpolate: function(gcode, maxDistance = 5){
			this.input = gcode;
			this.parseGcode();
			this.maxDistance = maxDistance;
		},
		getGCode: function (){
			return this.output;
		}
	};
	
})();

var gcode = `
N1 (Credit to Shapeoko Wiki for this calibration file)
N2 G17 G21 G90
N3 F355
N4 G1 Z-1
N5 G1 Z1
N6 G0 X0 Y0
N7 G17 G21 G90
N8 G0 Z1
N9 G0 X-17.75 Y-17.5
N10 G1 Z-3.0
N11 G1 X-17.75 Y-17.5
N12 G1 X-17.5 Y-17.75
N13 G1 X-18.5 Y-18.5
N14 G1 Y-15.7
N15 G1 X-15.7 Y-18.5
N16 G1 X-18.5
N17 G1 X-20 Y-20
N18 G1 Y-12
N19 G1 X-12 Y-20
N20 G1 X-20 Y-20
N21 G1 X-21.5 Y-21.5
N22 G1 Y-8.45
N23 G1 X-8.45 Y-21.5
N24 G1 X-21.5 Y-21.5
N25 G1 X-23 Y-23
N26 G1 Y-4.83
N27 G1 X-4.83 Y-23
N28 G1 X-23 Y-23
N29 G1 X-24.5 Y-24.5
N30 G1 Y-1.2
N31 G1 X-1.2 Y-24.5
N32 G1 X-24.5 Y-24.5
N33 G1 X-25 Y-25
N34 G1 Y0
N35 G1 X0 Y-25
N36 G1 X-25 Y-25
N37 G0 Z1
N38 G0 X17.75 Y-17.5
N39 G1 Z-3.0
N40 G1 X17.75 Y-17.5
N41 G1 X17.5 Y-17.75
N42 G1 X18.5 Y-18.5
N43 G1 Y-15.7
N44 G1 X15.7 Y-18.5
N45 G1 X18.5
N46 G1 X20 Y-20
N47 G1 Y-12
N48 G1 X12 Y-20
N49 G1 X20 Y-20
N50 G1 X21.5 Y-21.5
N51 G1 Y-8.45
N52 G1 X8.45 Y-21.5
N53 G1 X21.5 Y-21.5
N54 G1 X23 Y-23
N55 G1 Y-4.83
N56 G1 X4.83 Y-23
N57 G1 X23 Y-23
N58 G1 X24.5 Y-24.5
N59 G1 Y-1.2
N60 G1 X1.2 Y-24.5
N61 G1 X24.5 Y-24.5
N62 G1 X25 Y-25
N63 G1 Y0
N64 G1 X0 Y-25
N65 G1 X25 Y-25
N66 G0 Z1
N67 G0 X17.75 Y17.5
N68 G1 Z-3.0
N69 G1 X17.75 Y17.5
N70 G1 X17.5 Y17.75
N71 G1 X18.5 Y18.5
N72 G1 Y15.7
N73 G1 X15.7 Y18.5
N74 G1 X18.5
N75 G1 X20 Y20
N76 G1 Y12
N77 G1 X12 Y20
N78 G1 X20 Y20
N79 G1 X21.5 Y21.5
N80 G1 Y8.45
N81 G1 X8.45 Y21.5
N82 G1 X21.5 Y21.5
N83 G1 X23 Y23
N84 G1 Y4.83
N85 G1 X4.83 Y23
N86 G1 X23 Y23
N87 G1 X24.5 Y24.5
N88 G1 Y1.2
N89 G1 X1.2 Y24.5
N90 G1 X24.5 Y24.5
N91 G1 X25 Y25
N92 G1 Y0
N93 G1 X0 Y25
N94 G1 X25 Y25
N95 G0 Z1
N96 G0 X-17.75 Y17.5
N97 G1 Z-3.0
N98 G1 X-17.75 Y17.5
N99 G1 X-17.5 Y17.75
N100 G1 X-18.5 Y18.5
N101 G1 Y15.7
N102 G1 X-15.7 Y18.5
N103 G1 X-18.5
N104 G1 X-20 Y20
N105 G1 Y12
N106 G1 X-12 Y20
N107 G1 X-20 Y20
N108 G1 X-21.5 Y21.5
N109 G1 Y8.45
N110 G1 X-8.45 Y21.5
N111 G1 X-21.5 Y21.5
N112 G1 X-23 Y23
N113 G1 Y4.83
N114 G1 X-4.83 Y23
N115 G1 X-23 Y23
N116 G1 X-24.5 Y24.5
N117 G1 Y1.2
N118 G1 X-1.2 Y24.5
N119 G1 X-24.5 Y24.5
N120 G1 X-25 Y25
N121 G1 Y0
N122 G1 X-0 Y25
N123 G1 X-25 Y25
N124 G0 Z1
N125 G0 X0 Y0
N126 G17 G21 G90
N127 G0 Z1
N128 G0 X-17.75 Y-17.5
N129 G1 Z-3.5
N130 G1 X-17.75 Y-17.5
N131 G1 X-17.5 Y-17.75
N132 G1 X-18.5 Y-18.5
N133 G1 Y-15.7
N134 G1 X-15.7 Y-18.5
N135 G1 X-18.5
N136 G1 X-20 Y-20
N137 G1 Y-12
N138 G1 X-12 Y-20
N139 G1 X-20 Y-20
N140 G1 X-21.5 Y-21.5
N141 G1 Y-8.45
N142 G1 X-8.45 Y-21.5
N143 G1 X-21.5 Y-21.5
N144 G1 X-23 Y-23
N145 G1 Y-4.83
N146 G1 X-4.83 Y-23
N147 G1 X-23 Y-23
N148 G1 X-24.5 Y-24.5
N149 G1 Y-1.2
N150 G1 X-1.2 Y-24.5
N151 G1 X-24.5 Y-24.5
N152 G1 X-25 Y-25
N153 G1 Y0
N154 G1 X0 Y-25
N155 G1 X-25 Y-25
N156 G0 Z1
N157 G0 X17.75 Y-17.5
N158 G1 Z-3.5
N159 G1 X17.75 Y-17.5
N160 G1 X17.5 Y-17.75
N161 G1 X18.5 Y-18.5
N162 G1 Y-15.7
N163 G1 X15.7 Y-18.5
N164 G1 X18.5
N165 G1 X20 Y-20
N166 G1 Y-12
N167 G1 X12 Y-20
N168 G1 X20 Y-20
N169 G1 X21.5 Y-21.5
N170 G1 Y-8.45
N171 G1 X8.45 Y-21.5
N172 G1 X21.5 Y-21.5
N173 G1 X23 Y-23
N174 G1 Y-4.83
N175 G1 X4.83 Y-23
N176 G1 X23 Y-23
N177 G1 X24.5 Y-24.5
N178 G1 Y-1.2
N179 G1 X1.2 Y-24.5
N180 G1 X24.5 Y-24.5
N181 G1 X25 Y-25
N182 G1 Y0
N183 G1 X0 Y-25
N184 G1 X25 Y-25
N185 G0 Z1
N186 G0 X17.75 Y17.5
N187 G1 Z-3.5
N188 G1 X17.75 Y17.5
N189 G1 X17.5 Y17.75
N190 G1 X18.5 Y18.5
N191 G1 Y15.7
N192 G1 X15.7 Y18.5
N193 G1 X18.5
N194 G1 X20 Y20
N195 G1 Y12
N196 G1 X12 Y20
N197 G1 X20 Y20
N198 G1 X21.5 Y21.5
N199 G1 Y8.45
N200 G1 X8.45 Y21.5
N201 G1 X21.5 Y21.5
N202 G1 X23 Y23
N203 G1 Y4.83
N204 G1 X4.83 Y23
N205 G1 X23 Y23
N206 G1 X24.5 Y24.5
N207 G1 Y1.2
N208 G1 X1.2 Y24.5
N209 G1 X24.5 Y24.5
N210 G1 X25 Y25
N211 G1 Y0
N212 G1 X0 Y25
N213 G1 X25 Y25
N214 G0 Z1
N215 G0 X-17.75 Y17.5
N216 G1 Z-3.5
N217 G1 X-17.75 Y17.5
N218 G1 X-17.5 Y17.75
N219 G1 X-18.5 Y18.5
N220 G1 Y15.7
N221 G1 X-15.7 Y18.5
N222 G1 X-18.5
N223 G1 X-20 Y20
N224 G1 Y12
N225 G1 X-12 Y20
N226 G1 X-20 Y20
N227 G1 X-21.5 Y21.5
N228 G1 Y8.45
N229 G1 X-8.45 Y21.5
N230 G1 X-21.5 Y21.5
N231 G1 X-23 Y23
N232 G1 Y4.83
N233 G1 X-4.83 Y23
N234 G1 X-23 Y23
N235 G1 X-24.5 Y24.5
N236 G1 Y1.2
N237 G1 X-1.2 Y24.5
N238 G1 X-24.5 Y24.5
N239 G1 X-25 Y25
N240 G1 Y0
N241 G1 X-0 Y25
N242 G1 X-25 Y25
N243 G0 Z1
N244 G0 X0 Y0
N245 G17 G21 G90
N246 G0 Z1
N247 G0 X-17.75 Y-17.5
N248 G1 Z-4.0
N249 G1 X-17.75 Y-17.5
N250 G1 X-17.5 Y-17.75
N251 G1 X-18.5 Y-18.5
N252 G1 Y-15.7
N253 G1 X-15.7 Y-18.5
N254 G1 X-18.5
N255 G1 X-20 Y-20
N256 G1 Y-12
N257 G1 X-12 Y-20
N258 G1 X-20 Y-20
N259 G1 X-21.5 Y-21.5
N260 G1 Y-8.45
N261 G1 X-8.45 Y-21.5
N262 G1 X-21.5 Y-21.5
N263 G1 X-23 Y-23
N264 G1 Y-4.83
N265 G1 X-4.83 Y-23
N266 G1 X-23 Y-23
N267 G1 X-24.5 Y-24.5
N268 G1 Y-1.2
N269 G1 X-1.2 Y-24.5
N270 G1 X-24.5 Y-24.5
N271 G1 X-25 Y-25
N272 G1 Y0
N273 G1 X0 Y-25
N274 G1 X-25 Y-25
N275 G0 Z1
N276 G0 X17.75 Y-17.5
N277 G1 Z-4.0
N278 G1 X17.75 Y-17.5
N279 G1 X17.5 Y-17.75
N280 G1 X18.5 Y-18.5
N281 G1 Y-15.7
N282 G1 X15.7 Y-18.5
N283 G1 X18.5
N284 G1 X20 Y-20
N285 G1 Y-12
N286 G1 X12 Y-20
N287 G1 X20 Y-20
N288 G1 X21.5 Y-21.5
N289 G1 Y-8.45
N290 G1 X8.45 Y-21.5
N291 G1 X21.5 Y-21.5
N292 G1 X23 Y-23
N293 G1 Y-4.83
N294 G1 X4.83 Y-23
N295 G1 X23 Y-23
N296 G1 X24.5 Y-24.5
N297 G1 Y-1.2
N298 G1 X1.2 Y-24.5
N299 G1 X24.5 Y-24.5
N300 G1 X25 Y-25
N301 G1 Y0
N302 G1 X0 Y-25
N303 G1 X25 Y-25
N304 G0 Z1
N305 G0 X17.75 Y17.5
N306 G1 Z-4.0
N307 G1 X17.75 Y17.5
N308 G1 X17.5 Y17.75
N309 G1 X18.5 Y18.5
N310 G1 Y15.7
N311 G1 X15.7 Y18.5
N312 G1 X18.5
N313 G1 X20 Y20
N314 G1 Y12
N315 G1 X12 Y20
N316 G1 X20 Y20
N317 G1 X21.5 Y21.5
N318 G1 Y8.45
N319 G1 X8.45 Y21.5
N320 G1 X21.5 Y21.5
N321 G1 X23 Y23
N322 G1 Y4.83
N323 G1 X4.83 Y23
N324 G1 X23 Y23
N325 G1 X24.5 Y24.5
N326 G1 Y1.2
N327 G1 X1.2 Y24.5
N328 G1 X24.5 Y24.5
N329 G1 X25 Y25
N330 G1 Y0
N331 G1 X0 Y25
N332 G1 X25 Y25
N333 G0 Z1
N334 G0 X-17.75 Y17.5
N335 G1 Z-4.0
N336 G1 X-17.75 Y17.5
N337 G1 X-17.5 Y17.75
N338 G1 X-18.5 Y18.5
N339 G1 Y15.7
N340 G1 X-15.7 Y18.5
N341 G1 X-18.5
N342 G1 X-20 Y20
N343 G1 Y12
N344 G1 X-12 Y20
N345 G1 X-20 Y20
N346 G1 X-21.5 Y21.5
N347 G1 Y8.45
N348 G1 X-8.45 Y21.5
N349 G1 X-21.5 Y21.5
N350 G1 X-23 Y23
N351 G1 Y4.83
N352 G1 X-4.83 Y23
N353 G1 X-23 Y23
N354 G1 X-24.5 Y24.5
N355 G1 Y1.2
N356 G1 X-1.2 Y24.5
N357 G1 X-24.5 Y24.5
N358 G1 X-25 Y25
N359 G1 Y0
N360 G1 X-0 Y25
N361 G1 X-25 Y25
N362 G0 Z1
N363 G0 X0 Y0
N364 G17 G21 G90
N365 G0 Z1
N366 G0 X-17.75 Y-17.5
N367 G1 Z-4.5
N368 G1 X-17.75 Y-17.5
N369 G1 X-17.5 Y-17.75
N370 G1 X-18.5 Y-18.5
N371 G1 Y-15.7
N372 G1 X-15.7 Y-18.5
N373 G1 X-18.5
N374 G1 X-20 Y-20
N375 G1 Y-12
N376 G1 X-12 Y-20
N377 G1 X-20 Y-20
N378 G1 X-21.5 Y-21.5
N379 G1 Y-8.45
N380 G1 X-8.45 Y-21.5
N381 G1 X-21.5 Y-21.5
N382 G1 X-23 Y-23
N383 G1 Y-4.83
N384 G1 X-4.83 Y-23
N385 G1 X-23 Y-23
N386 G1 X-24.5 Y-24.5
N387 G1 Y-1.2
N388 G1 X-1.2 Y-24.5
N389 G1 X-24.5 Y-24.5
N390 G1 X-25 Y-25
N391 G1 Y0
N392 G1 X0 Y-25
N393 G1 X-25 Y-25
N394 G0 Z1
N395 G0 X17.75 Y-17.5
N396 G1 Z-4.5
N397 G1 X17.75 Y-17.5
N398 G1 X17.5 Y-17.75
N399 G1 X18.5 Y-18.5
N400 G1 Y-15.7
N401 G1 X15.7 Y-18.5
N402 G1 X18.5
N403 G1 X20 Y-20
N404 G1 Y-12
N405 G1 X12 Y-20
N406 G1 X20 Y-20
N407 G1 X21.5 Y-21.5
N408 G1 Y-8.45
N409 G1 X8.45 Y-21.5
N410 G1 X21.5 Y-21.5
N411 G1 X23 Y-23
N412 G1 Y-4.83
N413 G1 X4.83 Y-23
N414 G1 X23 Y-23
N415 G1 X24.5 Y-24.5
N416 G1 Y-1.2
N417 G1 X1.2 Y-24.5
N418 G1 X24.5 Y-24.5
N419 G1 X25 Y-25
N420 G1 Y0
N421 G1 X0 Y-25
N422 G1 X25 Y-25
N423 G0 Z1
N424 G0 X17.75 Y17.5
N425 G1 Z-4.5
N426 G1 X17.75 Y17.5
N427 G1 X17.5 Y17.75
N428 G1 X18.5 Y18.5
N429 G1 Y15.7
N430 G1 X15.7 Y18.5
N431 G1 X18.5
N432 G1 X20 Y20
N433 G1 Y12
N434 G1 X12 Y20
N435 G1 X20 Y20
N436 G1 X21.5 Y21.5
N437 G1 Y8.45
N438 G1 X8.45 Y21.5
N439 G1 X21.5 Y21.5
N440 G1 X23 Y23
N441 G1 Y4.83
N442 G1 X4.83 Y23
N443 G1 X23 Y23
N444 G1 X24.5 Y24.5
N445 G1 Y1.2
N446 G1 X1.2 Y24.5
N447 G1 X24.5 Y24.5
N448 G1 X25 Y25
N449 G1 Y0
N450 G1 X0 Y25
N451 G1 X25 Y25
N452 G0 Z1
N453 G0 X-17.75 Y17.5
N454 G1 Z-4.5
N455 G1 X-17.75 Y17.5
N456 G1 X-17.5 Y17.75
N457 G1 X-18.5 Y18.5
N458 G1 Y15.7
N459 G1 X-15.7 Y18.5
N460 G1 X-18.5
N461 G1 X-20 Y20
N462 G1 Y12
N463 G1 X-12 Y20
N464 G1 X-20 Y20
N465 G1 X-21.5 Y21.5
N466 G1 Y8.45
N467 G1 X-8.45 Y21.5
N468 G1 X-21.5 Y21.5
N469 G1 X-23 Y23
N470 G1 Y4.83
N471 G1 X-4.83 Y23
N472 G1 X-23 Y23
N473 G1 X-24.5 Y24.5
N474 G1 Y1.2
N475 G1 X-1.2 Y24.5
N476 G1 X-24.5 Y24.5
N477 G1 X-25 Y25
N478 G1 Y0
N479 G1 X-0 Y25
N480 G1 X-25 Y25
N481 G0 Z1
N482 G0 X0 Y0
N483 G17 G21 G90
N484 G0 Z1
N485 G0 X-17.75 Y-17.5
N486 G1 Z-5.0
N487 G1 X-17.75 Y-17.5
N488 G1 X-17.5 Y-17.75
N489 G1 X-18.5 Y-18.5
N490 G1 Y-15.7
N491 G1 X-15.7 Y-18.5
N492 G1 X-18.5
N493 G1 X-20 Y-20
N494 G1 Y-12
N495 G1 X-12 Y-20
N496 G1 X-20 Y-20
N497 G1 X-21.5 Y-21.5
N498 G1 Y-8.45
N499 G1 X-8.45 Y-21.5
N500 G1 X-21.5 Y-21.5
N501 G1 X-23 Y-23
N502 G1 Y-4.83
N503 G1 X-4.83 Y-23
N504 G1 X-23 Y-23
N505 G1 X-24.5 Y-24.5
N506 G1 Y-1.2
N507 G1 X-1.2 Y-24.5
N508 G1 X-24.5 Y-24.5
N509 G1 X-25 Y-25
N510 G1 Y0
N511 G1 X0 Y-25
N512 G1 X-25 Y-25
N513 G0 Z1
N514 G0 X17.75 Y-17.5
N515 G1 Z-5.0
N516 G1 X17.75 Y-17.5
N517 G1 X17.5 Y-17.75
N518 G1 X18.5 Y-18.5
N519 G1 Y-15.7
N520 G1 X15.7 Y-18.5
N521 G1 X18.5
N522 G1 X20 Y-20
N523 G1 Y-12
N524 G1 X12 Y-20
N525 G1 X20 Y-20
N526 G1 X21.5 Y-21.5
N527 G1 Y-8.45
N528 G1 X8.45 Y-21.5
N529 G1 X21.5 Y-21.5
N530 G1 X23 Y-23
N531 G1 Y-4.83
N532 G1 X4.83 Y-23
N533 G1 X23 Y-23
N534 G1 X24.5 Y-24.5
N535 G1 Y-1.2
N536 G1 X1.2 Y-24.5
N537 G1 X24.5 Y-24.5
N538 G1 X25 Y-25
N539 G1 Y0
N540 G1 X0 Y-25
N541 G1 X25 Y-25
N542 G0 Z1
N543 G0 X17.75 Y17.5
N544 G1 Z-5.0
N545 G1 X17.75 Y17.5
N546 G1 X17.5 Y17.75
N547 G1 X18.5 Y18.5
N548 G1 Y15.7
N549 G1 X15.7 Y18.5
N550 G1 X18.5
N551 G1 X20 Y20
N552 G1 Y12
N553 G1 X12 Y20
N554 G1 X20 Y20
N555 G1 X21.5 Y21.5
N556 G1 Y8.45
N557 G1 X8.45 Y21.5
N558 G1 X21.5 Y21.5
N559 G1 X23 Y23
N560 G1 Y4.83
N561 G1 X4.83 Y23
N562 G1 X23 Y23
N563 G1 X24.5 Y24.5
N564 G1 Y1.2
N565 G1 X1.2 Y24.5
N566 G1 X24.5 Y24.5
N567 G1 X25 Y25
N568 G1 Y0
N569 G1 X0 Y25
N570 G1 X25 Y25
N571 G0 Z1
N572 G0 X-17.75 Y17.5
N573 G1 Z-5.0
N574 G1 X-17.75 Y17.5
N575 G1 X-17.5 Y17.75
N576 G1 X-18.5 Y18.5
N577 G1 Y15.7
N578 G1 X-15.7 Y18.5
N579 G1 X-18.5
N580 G1 X-20 Y20
N581 G1 Y12
N582 G1 X-12 Y20
N583 G1 X-20 Y20
N584 G1 X-21.5 Y21.5
N585 G1 Y8.45
N586 G1 X-8.45 Y21.5
N587 G1 X-21.5 Y21.5
N588 G1 X-23 Y23
N589 G1 Y4.83
N590 G1 X-4.83 Y23
N591 G1 X-23 Y23
N592 G1 X-24.5 Y24.5
N593 G1 Y1.2
N594 G1 X-1.2 Y24.5
N595 G1 X-24.5 Y24.5
N596 G1 X-25 Y25
N597 G1 Y0
N598 G1 X-0 Y25
N599 G1 X-25 Y25
N600 G0 Z1
N601 G0 X0 Y0
N602 G0 Z1
N603 G0 X-21 Y-21
N604 G1 Z-5.5
N605 G1 X-21 Y-20
N606 G3 X-20 Y-21 I21 J20
N607 G1 X-21 Y-21
N608 G1 X-22.5 Y-22.5
N609 G1 Y-15.8
N610 G3 X-15.8 Y-22.5 I22.5 J15.8
N611 G1 X-22.5
N612 G1 X-24 Y-24
N613 G1 Y-10
N614 G3 X-10 Y-24 I24 J10
N615 G1 X-24
N616 G1 X-25 Y-25
N617 G1 Y0
N618 G3 X0 Y-25 I25 J0
N619 G1 X-25
N620 G0 Z1
N621 G0 X21 Y-21
N622 G1 Z-5.5
N623 G1 X20
N624 G3 X21 Y-20 I20 J21
N625 G1 Y-21
N626 G1 X22.5 Y-22.5
N627 G1 X15.8
N628 G3 X22.5 Y-15.8 I-15.8 J22.5
N629 G1 Y-22.5
N630 G1 X24 Y-24
N631 G1 X10
N632 G3 X24 Y-10 I-10 J24
N633 G1 Y-24
N634 G1 X25 Y-25
N635 G1 X0
N636 G3 X25 Y0 I0 J25
N637 G1 Y-25
N638 G1 Z1
N639 G0 X21 Y21
N640 G1 Z-5.5
N641 G1 X21 Y20
N642 G3 X20 Y21 I-21 J-20
N643 G1 X21 Y21
N644 G1 X22.5 Y22.5
N645 G1 Y15.8
N646 G3 X15.8 Y22.5 I-22.5 J-15.8
N647 G1 X22.5
N648 G1 X24 Y24
N649 G1 Y10
N650 G3 X10 Y24 I-24 J-10
N651 G1 X24
N652 G1 X25 Y25
N653 G1 Y0
N654 G3 X0 Y25 I-25 J0
N655 G1 X25
N656 G0 Z1
N657 G0 X-21 Y21
N658 G1 Z-5.5
N659 G1 X-20
N660 G3 X-21 Y20 I20 J-21
N661 G1 Y21
N662 G1 X-22.5 Y22.5
N663 G1 X-15.8
N664 G3 X-22.5 Y15.8 I15.8 J-22.5
N665 G1 Y22.5
N666 G1 X-24 Y24
N667 G1 X-10
N668 G3 X-24 Y10 I10 J-24
N669 G1 Y24
N670 G1 X-25 Y25
N671 G1 X0
N672 G3 X-25 Y0 I0 J-25
N673 G1 Y25
N674 G0 Z1
N675 G0 X-21 Y-21
N676 G1 Z-6
N677 G1 X-21 Y-20
N678 G3 X-20 Y-21 I21 J20
N679 G1 X-21 Y-21
N680 G1 X-22.5 Y-22.5
N681 G1 Y-15.8
N682 G3 X-15.8 Y-22.5 I22.5 J15.8
N683 G1 X-22.5
N684 G1 X-24 Y-24
N685 G1 Y-10
N686 G3 X-10 Y-24 I24 J10
N687 G1 X-24
N688 G1 X-25 Y-25
N689 G1 Y0
N690 G3 X0 Y-25 I25 J0
N691 G1 X-25
N692 G0 Z1
N693 G0 X21 Y-21
N694 G1 Z-6
N695 G1 X20
N696 G3 X21 Y-20 I20 J21
N697 G1 Y-21
N698 G1 X22.5 Y-22.5
N699 G1 X15.8
N700 G3 X22.5 Y-15.8 I-15.8 J22.5
N701 G1 Y-22.5
N702 G1 X24 Y-24
N703 G1 X10
N704 G3 X24 Y-10 I-10 J24
N705 G1 Y-24
N706 G1 X25 Y-25
N707 G1 X0
N708 G3 X25 Y0 I0 J25
N709 G1 Y-25
N710 G1 Z1
N711 G0 X21 Y21
N712 G1 Z-6
N713 G1 X21 Y20
N714 G3 X20 Y21 I-21 J-20
N715 G1 X21 Y21
N716 G1 X22.5 Y22.5
N717 G1 Y15.8
N718 G3 X15.8 Y22.5 I-22.5 J-15.8
N719 G1 X22.5
N720 G1 X24 Y24
N721 G1 Y10
N722 G3 X10 Y24 I-24 J-10
N723 G1 X24
N724 G1 X25 Y25
N725 G1 Y0
N726 G3 X0 Y25 I-25 J0
N727 G1 X25
N728 G0 Z1
N729 G0 X-21 Y21
N730 G1 Z-6
N731 G1 X-20
N732 G3 X-21 Y20 I20 J-21
N733 G1 Y21
N734 G1 X-22.5 Y22.5
N735 G1 X-15.8
N736 G3 X-22.5 Y15.8 I15.8 J-22.5
N737 G1 Y22.5
N738 G1 X-24 Y24
N739 G1 X-10
N740 G3 X-24 Y10 I10 J-24
N741 G1 Y24
N742 G1 X-25 Y25
N743 G1 X0
N744 G3 X-25 Y0 I0 J-25
N745 G1 Y25
N746 G0 Z1
N747 G0 X-21 Y-21
N748 G1 Z-6.5
N749 G1 X-21 Y-20
N750 G3 X-20 Y-21 I21 J20
N751 G1 X-21 Y-21
N752 G1 X-22.5 Y-22.5
N753 G1 Y-15.8
N754 G3 X-15.8 Y-22.5 I22.5 J15.8
N755 G1 X-22.5
N756 G1 X-24 Y-24
N757 G1 Y-10
N758 G3 X-10 Y-24 I24 J10
N759 G1 X-24
N760 G1 X-25 Y-25
N761 G1 Y0
N762 G3 X0 Y-25 I25 J0
N763 G1 X-25
N764 G0 Z1
N765 G0 X21 Y-21
N766 G1 Z-6.5
N767 G1 X20
N768 G3 X21 Y-20 I20 J21
N769 G1 Y-21
N770 G1 X22.5 Y-22.5
N771 G1 X15.8
N772 G3 X22.5 Y-15.8 I-15.8 J22.5
N773 G1 Y-22.5
N774 G1 X24 Y-24
N775 G1 X10
N776 G3 X24 Y-10 I-10 J24
N777 G1 Y-24
N778 G1 X25 Y-25
N779 G1 X0
N780 G3 X25 Y0 I0 J25
N781 G1 Y-25
N782 G1 Z1
N783 G0 X21 Y21
N784 G1 Z-6.5
N785 G1 X21 Y20
N786 G3 X20 Y21 I-21 J-20
N787 G1 X21 Y21
N788 G1 X22.5 Y22.5
N789 G1 Y15.8
N790 G3 X15.8 Y22.5 I-22.5 J-15.8
N791 G1 X22.5
N792 G1 X24 Y24
N793 G1 Y10
N794 G3 X10 Y24 I-24 J-10
N795 G1 X24
N796 G1 X25 Y25
N797 G1 Y0
N798 G3 X0 Y25 I-25 J0
N799 G1 X25
N800 G0 Z1
N801 G0 X-21 Y21
N802 G1 Z-6.5
N803 G1 X-20
N804 G3 X-21 Y20 I20 J-21
N805 G1 Y21
N806 G1 X-22.5 Y22.5
N807 G1 X-15.8
N808 G3 X-22.5 Y15.8 I15.8 J-22.5
N809 G1 Y22.5
N810 G1 X-24 Y24
N811 G1 X-10
N812 G3 X-24 Y10 I10 J-24
N813 G1 Y24
N814 G1 X-25 Y25
N815 G1 X0
N816 G3 X-25 Y0 I0 J-25
N817 G1 Y25
N818 G0 Z1
N819 G0 X-21 Y-21
N820 G1 Z-7
N821 G1 X-21 Y-20
N822 G3 X-20 Y-21 I21 J20
N823 G1 X-21 Y-21
N824 G1 X-22.5 Y-22.5
N825 G1 Y-15.8
N826 G3 X-15.8 Y-22.5 I22.5 J15.8
N827 G1 X-22.5
N828 G1 X-24 Y-24
N829 G1 Y-10
N830 G3 X-10 Y-24 I24 J10
N831 G1 X-24
N832 G1 X-25 Y-25
N833 G1 Y0
N834 G3 X0 Y-25 I25 J0
N835 G1 X-25
N836 G0 Z1
N837 G0 X21 Y-21
N838 G1 Z-7
N839 G1 X20
N840 G3 X21 Y-20 I20 J21
N841 G1 Y-21
N842 G1 X22.5 Y-22.5
N843 G1 X15.8
N844 G3 X22.5 Y-15.8 I-15.8 J22.5
N845 G1 Y-22.5
N846 G1 X24 Y-24
N847 G1 X10
N848 G3 X24 Y-10 I-10 J24
N849 G1 Y-24
N850 G1 X25 Y-25
N851 G1 X0
N852 G3 X25 Y0 I0 J25
N853 G1 Y-25
N854 G1 Z1
N855 G0 X21 Y21
N856 G1 Z-7
N857 G1 X21 Y20
N858 G3 X20 Y21 I-21 J-20
N859 G1 X21 Y21
N860 G1 X22.5 Y22.5
N861 G1 Y15.8
N862 G3 X15.8 Y22.5 I-22.5 J-15.8
N863 G1 X22.5
N864 G1 X24 Y24
N865 G1 Y10
N866 G3 X10 Y24 I-24 J-10
N867 G1 X24
N868 G1 X25 Y25
N869 G1 Y0
N870 G3 X0 Y25 I-25 J0
N871 G1 X25
N872 G0 Z1
N873 G0 X-21 Y21
N874 G1 Z-7
N875 G1 X-20
N876 G3 X-21 Y20 I20 J-21
N877 G1 Y21
N878 G1 X-22.5 Y22.5
N879 G1 X-15.8
N880 G3 X-22.5 Y15.8 I15.8 J-22.5
N881 G1 Y22.5
N882 G1 X-24 Y24
N883 G1 X-10
N884 G3 X-24 Y10 I10 J-24
N885 G1 Y24
N886 G1 X-25 Y25
N887 G1 X0
N888 G3 X-25 Y0 I0 J-25
N889 G1 Y25
N890 G0 Z1
N891 G0 X-21 Y-21
N892 G1 Z-7.5
N893 G1 X-21 Y-20
N894 G3 X-20 Y-21 I21 J20
N895 G1 X-21 Y-21
N896 G1 X-22.5 Y-22.5
N897 G1 Y-15.8
N898 G3 X-15.8 Y-22.5 I22.5 J15.8
N899 G1 X-22.5
N900 G1 X-24 Y-24
N901 G1 Y-10
N902 G3 X-10 Y-24 I24 J10
N903 G1 X-24
N904 G1 X-25 Y-25
N905 G1 Y0
N906 G3 X0 Y-25 I25 J0
N907 G1 X-25
N908 G0 Z1
N909 G0 X21 Y-21
N910 G1 Z-7.5
N911 G1 X20
N912 G3 X21 Y-20 I20 J21
N913 G1 Y-21
N914 G1 X22.5 Y-22.5
N915 G1 X15.8
N916 G3 X22.5 Y-15.8 I-15.8 J22.5
N917 G1 Y-22.5
N918 G1 X24 Y-24
N919 G1 X10
N920 G3 X24 Y-10 I-10 J24
N921 G1 Y-24
N922 G1 X25 Y-25
N923 G1 X0
N924 G3 X25 Y0 I0 J25
N925 G1 Y-25
N926 G1 Z1
N927 G0 X21 Y21
N928 G1 Z-7.5
N929 G1 X21 Y20
N930 G3 X20 Y21 I-21 J-20
N931 G1 X21 Y21
N932 G1 X22.5 Y22.5
N933 G1 Y15.8
N934 G3 X15.8 Y22.5 I-22.5 J-15.8
N935 G1 X22.5
N936 G1 X24 Y24
N937 G1 Y10
N938 G3 X10 Y24 I-24 J-10
N939 G1 X24
N940 G1 X25 Y25
N941 G1 Y0
N942 G3 X0 Y25 I-25 J0
N943 G1 X25
N944 G0 Z1
N945 G0 X-21 Y21
N946 G1 Z-7.5
N947 G1 X-20
N948 G3 X-21 Y20 I20 J-21
N949 G1 Y21
N950 G1 X-22.5 Y22.5
N951 G1 X-15.8
N952 G3 X-22.5 Y15.8 I15.8 J-22.5
N953 G1 Y22.5
N954 G1 X-24 Y24
N955 G1 X-10
N956 G3 X-24 Y10 I10 J-24
N957 G1 Y24
N958 G1 X-25 Y25
N959 G1 X0
N960 G3 X-25 Y0 I0 J-25
N961 G1 Y25
N962 G0 Z1
N963 G0 X-25 Y-25
N964 G1 Z-8
N965 G1 X25
N966 G1 Y25
N967 G1 X-25
N968 G1 Y-25
N969 G1 Z-8.5
N970 G1 X25
N971 G1 Y25
N972 G1 X-25
N973 G1 Y-25
N974 G1 Z-9
N975 G1 X25
N976 G1 Y25
N977 G1 X-25
N978 G1 Y-25
N979 G1 Z-9.5
N980 G1 X25
N981 G1 Y25
N982 G1 X-25
N983 G1 Y-25
N984 G1 Z-10
N985 G1 X25
N986 G1 Y25
N987 G1 X-25
N988 G1 Y-25
`;
gcode = gcode.split("\n");
var ii = new interPolator;
ii.interpolate(gcode);
document.getElementById('output').innerHTML = ii.getGCode.join('<br/>');
</script>
</html>

