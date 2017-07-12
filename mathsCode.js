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
		var coord['x'] = new RegExp("X\\s*(\\d+)",'i');
		var coord['y'] = new RegExp("Y\\s*(\\d+)",'i');
		var coord['z'] = new RegExp("Z\\s*(\\d+)",'i');
		var offset['i'] = new RegExp("I\\s*(\\d+)",'i');
		var offset['j'] = new RegExp("J\\s*(\\d+)",'i');
		var offset['k'] = new RegExp("K\\s*(\\d+)",'i');
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
							returnArray.push("G2 X" + x + " Y" + y + " Z" + end.z + " R" + radius);
						}else{
							returnArray.push("G2 X" + x + " Y" + y + " R" + radius);
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
							returnArray.push("G3 X" + x + " Y" + y + " Z" + end.z + " R" + radius);
						}else{
							returnArray.push("G3 X" + x + " Y" + y + " R" + radius);
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
		};
	
})();
