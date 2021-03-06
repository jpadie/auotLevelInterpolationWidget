var interPolator = (function (){
	var input=[];
	var output=[];
	var maxDistance=5;
	var lineCounter = 0;
	var mapping = [];
	var addMapping = function(codeNum, elem){
		console.log("adding mapping", codeNum, elem);
		if(typeof mapping[codeNum] == "undefined"){
			mapping[codeNum] = [elem];
		} else {
			mapping[codeNum].push(elem);
		}
	};
	
	var parseGcode=function (){
		var curPos = {x:0, y:0, z:0};
		var lastCommand = '';
		var feedRate = 0;
		var command = new RegExp("(G\\s*(0|1|2|3)+)",'i');
		var coord = {	x:	new RegExp("X\\s*(-?\\d+)",'i'),
						y:  new RegExp("Y\\s*(-?\\d+)",'i'),
						z:	new RegExp("Z\\s*(-?\\d+)",'i')
		};
		var offset = {	i: new RegExp("I\\s*(-?\\d+)",'i'),
						j: new RegExp("J\\s*(-?\\d+)",'i'),
						k: new RegExp("K\\s*(-?\\d+)",'i')
		};
		var feedrate = new RegExp("F\\s*(\\d+)",'i');
		var radius = new RegExp("R\\s*(\\d+)",'i');
		var comment = new RegExp("(\\(.*?\\))");
		var lineNumber = new RegExp("N\\s*\\d*","i");
		var end = {};
		var oCodeNum = -1;
		var originalElement = '';
		
		input.forEach(function(elem){
			mapping = [];
			oCodeNum++;
			var result;
			var comments = [];
			elem = elem.trim();
			elem = elem.replace(lineNumber,'');
			originalElement = elem;
			var hasFeedrate = false;
			var hasCommand = false;
			var hasComment = false;
			if(comment.test(elem)){
				hasComment = true;
				var counter = 1;
				var _comments = comment.exec(elem);
				while(_comments && counter < 10){
					comments.push(_comments[1]);
					elem=elem.replace(_comments[1], '^'+ counter);
					counter++;
					_comments = comment.exec(elem);
				};
			}
			if(command.test(elem)){
				result = command.exec(elem);
				//get rid of intermediate spaces
				result[1] = result[1].replace(' ', '');
				lastCommand = result[1].toUpperCase();
				hasCommand=true;
			}
			if(feedrate.test(elem)){
				result = feedrate.exec(elem);
				feedRate = makeNumeric(elem[1]);
				hasFeedrate = true;
			}
			var hasCoords = false;
			var clockwise = false;
			switch(lastCommand){
				case 'G0':
				case 'G00':
				case 'G1':
				case 'G01':
					['x','y','z'].forEach(function (e,index, that){
						if(coord[e].test(elem)){
							var result = coord[e].exec(elem);
							end[e] = makeNumeric(result[1]);
							hasCoords = true;
						} else {
							end[e] = curPos[e];
						}
					}, this);
					if(hasCoords){
						var rValue = interpolateLine(curPos, end, feedrate);
						if(rValue === false){
							output.push("N" + lineCounter + " " + elem);
							addMapping(oCodeNum, elem);
							lineCounter++;
						} else{
							for(var i = 0; i <rValue.length; i++){
								var item = rValue[i];
								if(hasCommand){
									item = lastCommand + " " + item;
								} 
								if(hasFeedrate){
									item = item + " F" + feedrate;
								}
								if(hasComment && index == 0){
									comments.forEach(function(c,i){
										item=item.replace('^'+ (i+1), c);
									});
									comments = [];
								}
								output.push("N" + lineCounter + " " + item);
								addMapping(oCodeNum, item);
								lineCounter++;
							}
						}
					} else{
						output.push("N" + lineCounter + " " + originalElement);
						addMapping(oCodeNum, originalElement);
						lineCounter++;
					}
					curPos = end;
					end = {};
					break;
				
				case 'G2':
				case 'G02':
					var clockwise = true;
				case 'G3':
				case 'G03':
					['x','y','z'].forEach(function (e,index, that){
						if(coord[e].test(elem)){
							var result = coord[e].exec(elem);
							end[e] = makeNumeric(result[1]);
							hasCoords = true;
						} else {
							end[e] = curPos[e];
						}
					}, this);
					var hasOffset = false;
					var offsets = [];
					['i','j','k'].forEach(function(e,index, that){
							if(offset[e].test(elem)){
								var result = offset[e].exec(elem);
								offsets[e] = makeNumeric(result[1]);
								hasOffset = true;
							} else {
								offsets[e] = 0;
							}
					}, this);
					if(!hasCoords && !hasOffset){
						output.push("N" + lineCounter + " " + originalElement);
						addMapping(oCodeNum, originalElement);
						lineCounter++;
					} else {
						var hasRadius = false;
						if(!hasOffset){
							if(radius.test(elem)){
								var rr = radius.exec(elem);
								var Radius = makeNumeric(rr[1]);
								hasRadius = true;
								//interpolate arc with radius
							} else {
								output.push("N" + lineCounter + " " + originalElement); //don't know what to do so give up
								addMapping(oCodeNum, originalElement);
								lineCounter++;
							}
						} else {
							if(hasCoords){
								var rValue = interpolateArc(curPos, end, offsets, clockwise);
								if(rValue === false){
									output.push("N" + lineCounter + " " + originalElement);
									addMapping(oCodeNum, originalElement );
									lineCounter++;
								} else {
									rValue.forEach(function (e, index, that){
										if(hasFeedrate && index == 0){
											e = e + " F" + feedRate;
										}
										
										if(hasComment && index == 0){
											comments.forEach(function(c,i){
												e=e.replace('^'+ (i+1), c);
											});
											comments = [];
										}
										output.push("N" + lineCounter + " " + e);
										addMapping(oCodeNum, e );
										lineCounter++;
									}, this);
								}
							} else {
								//is a circle
								console.log('is a circle');
								end=curPos; //need this for later
								var rValue = interpolateCircle(curPos, offsets, clockwise);
								if(rValue === false){
									output.push("N" + lineCounter + " " + originalElement);
									addMapping(oCodeNum, originalElement );
									lineCounter++;
								} else {
									rValue.forEach(function(e, index, that){
										if(hasFeedrate && index == 0){
											e = e + " F" + feedRate;
										}
										
										if(hasComment && index == 0){
											comments.forEach(function(c,i){
												e=e.replace('^'+ (i+1), c);
											});
											comments = [];
										}
										output.push("N" + lineCounter + " " + e);
										addMapping(oCodeNum, e );
										lineCounter++;
									}, this);
								}
								
							}
						}
					}
					curPos = end;
					end = {};
				break;
				default:
					output.push("N" + lineCounter + " " + originalElement);
					addMapping(oCodeNum, originalElement );
					lineCounter++;
			}
		});
		console.log(mapping);
		return output;
	};
	
	var interpolateLine = function (start, end){
		var returnArray = [];
		var max
		['x','y','z'].forEach(function(axis, index, that){
			if(typeof end[axis] === "undefined"){
				end[axis] = start[axis];
			} else {
				end[axis] = makeNumeric(end[axis]);
			}
		}, this);
		
		var distance = Math.sqrt(Math.pow(end.x - start.x,2) + Math.pow(end.y-start.y,2));
		
		if(distance > maxDistance){
			var intermediateSteps  = Math.floor(distance/maxDistance);	
			for(var i = 0; i<intermediateSteps; i++){
				returnArray[i] = '';
				['x','y','z'].forEach(function (axis){
					var newVal = start[axis] + ((i+1) * (end[axis] - start[axis])/intermediateSteps);
					returnArray[i] = returnArray[i] + axis.toUpperCase() + newVal.toFixed(4) + " ";
				});
				returnArray[i] = returnArray[i] + " (added by line interpolator)";
			};
			return returnArray;
		} else {
			return false;
		}
	};
	
	var interpolateCircle = function (start,offset,clockwise=true){
		var returnArray = [];
		var origin = {	x:	start.x + offset.i,
						y:	start.y + offset.j,
						z:	start.z + offset.k };
		
		var radius = Math.sqrt( (offset.i * offset.i) + (offset.j * offset.j) );
		if(origin.z != start.z){
			return false;
		}
		var circumference = Math.PI * 2 * radius;
		if(circumference > maxDistance){
			//hmmm
			/* 
			 easiest is to calculate the angle of the starting point from due north.
			 then create a hemi-circle and interpolate
			*/
			
			var topPosition = {x: origin.x, y: origin.y + radius};
			var topChordLength = Math.sqrt(Math.pow(topPosition.x - start.x,2) + Math.pow(topPosition.y - start.y,2));
			var topAngle = 2 * Math.asin(topChordLength/(2 * radius));
			if(clockwise){
				var oppositeAngle = topAngle + Math.PI; //find inverse angle
			} else {
				var oppositeAngle = topAngle - Math.PI;
			}
			
			var x = origin.x + radius * Math.sin(oppositeAngle);	
			var y = origin.y + radius * Math.cos(oppositeAngle);
			//console.warning('x',x,'y',y);      	
			var temp;
			temp = interpolateArc(start, {x:x,y:y,z:start.z}, offset, clockwise);
			if(temp !== false){
				returnArray = returnArray.concat(temp);
			}
			offset.i = -1 * offset.i;
			offset.j = -1 * offset.j;
			
			temp2 = interpolateArc({x:x,y:y,z:start.z}, start, offset, clockwise);
			if(temp2 !== false){
				returnArray = returnArray.concat(temp2);
			}
			return returnArray;
		} else {
			return false;
		}
			
	};
	
	var interpolateArc = function(start, end, offset, clockwise = true){
		['x','y','z'].forEach(function(axis, index, that){
			if(typeof end[axis] === "undefined"){
				end[axis] = start[axis];
			} else {
				end[axis] = makeNumeric(end[axis]);
			}
		}, this);
		
		
		var returnArray = [];
		var origin = {	x:	start.x + offset.i,
						y:	start.y + offset.j,
						z:	start.z + offset.k };
		
		var radius = Math.sqrt( (offset.i * offset.i) + (offset.j * offset.j) );
		if(origin.z != start.z) return false;
		var circumference = Math.PI * 2 * radius;
		var chordLength = Math.sqrt(Math.pow(end.x-start.x,2) + Math.pow(end.y - start.y,2));
		var segmentAngle = 2 * (Math.asin(chordLength/(2 * radius)));
		var arcLength = circumference * segmentAngle/(2 * Math.PI);
		if(arcLength > maxDistance){
			var intermediateSteps = Math.floor(arcLength/maxDistance);
			//we need the angle from the vertical
			var topPosition = {x: origin.x, y: origin.y + radius};
			var topChordLength = Math.sqrt(Math.pow(topPosition.x - start.x,2) + Math.pow(topPosition.y - start.y,2));
			var topAngle = 2 * Math.asin(topChordLength/(2 * radius));
			
			if(start.x < origin.x){
				topAngle = Math.PI + topAngle;
			}
			for(var j =0; j<intermediateSteps; j++){
				if(clockwise){
					var angle = topAngle + ((j + 1) * segmentAngle/intermediateSteps);
				} else {
					var angle = topAngle - ((j + 1) * segmentAngle/intermediateSteps);
				}
				if(angle >= 2 * Math.PI){
					angle = angle-(2*Math.PI);
				}
				var x = origin.x + radius * Math.sin(angle);	
				var y = origin.y + radius * Math.cos(angle);	
				var z = start.z + (((end.z - start.z)/intermediateSteps) * (j+1));
				var str = "X" + x.toFixed(4) + " Y" + y.toFixed(4) + " Z" + z.toFixed(4) + " R" + radius.toFixed(4) + " (added by arc interpolator)";
				if(clockwise){
					returnArray.push("G2 " + str);
				} else {
					returnArray.push("G3 " + str);
				}
			}
			return returnArray;
		}
		return false;
	};
	var makeNumeric = function(variable){
		if(typeof variable == "number") return variable;
		if(isNaN(variable)) return false;
		return parseFloat(variable);
	};
	return {
		interpolate: function(gcode, _maxDistance = 5){
			input = gcode;
			maxDistance = _maxDistance;
			parseGcode();
			return output;
		}
	};
})();