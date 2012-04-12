/**
 * jQuery YouTube Chromless Plugin v0.1
 * Copyright (c) 2009 Tom Rodenberg <tarodenberg gmail com>
 */
/**
 * Depenencies: jQuery 1.3.2, swfobject 2.1
 *
 * Custom Events:
 * 	Global:
 * 		-YouTubeReadyGlobal
 *		-YouTubeStateChangeGlobal,
 * 	Element Specific:
 * 		-YouTubeReady
 *		-YouTubeStateChange
 */
(function($) {
/**
 * Private variables
 */
var dataId = 'youtube', 
	nullFn = function() {},
	defaultControlPrefix = "youtubeplayer_",
	chromelessUrl = 'http://www.youtube.com/apiplayer?enablejsapi=1&version=3',
	standardPlayerUrl = 'http://www.youtube.com/',
	onReadyOld,
	stateChangeListener,
	stateChangeListenerFn = 'youTubeStateChangeListener',
	states = {
		"-1": "unstarted",
		0: "ended",
		1: "playing",
		2: "paused",
		3: "buffering",
		5: "cued"
	},
	/** 
	 * An associative array containing all jquery youtube players
	 */
	players = {};

/**
 * A list of default options
 */
var defaultOptions = {
	/**
	 * You tube player we want to use
	 */
	playerUrl: chromelessUrl,
	
	/**
	 * ID for the flash player. [optional]
	 */
	playerId: null,
	
	/**
	 * Automatically start playing the first video in the playlist when the player is laoded
	 */
	autoplay: false,
	
	/**
	 * Width in pixels
	 */
	width: 320,
	
	/**
	 * Height in pixels
	 */ 
	height: 240,
	
	/**
	 * Background color for video and controls
	 */
	backgroundColor: '#CCCCCC',
	
	/**
	 * function to execute when the player is ready
	 * This might currently only fire when cueing a video
	 * change to onCue?
	 */
	onReady: nullFn,
	
	/** 
	* function to execute when the player begins playback
	*/
	onPlay: nullFn,
	
	/**
	 * function to execute when the player is paused
	 */
	onPause: nullFn,
	
	/**
	 * function to execute when the player is stopped
	 */
	onStop: nullFn,
	
	/**
	 * function to execute when the player state changes
	 * The function to be implemented will be called as follows:
	 *	function(player, playerId, state)
	 *		player: Player JS Object
	 *		playerId: Player String ID
	 *		state: number / Possible values of state are unstarted (-1), ended (0), playing (1), paused (2), buffering (3), video cued (5). 
	 *		stateText: string / Possible values of stateText are 'unstarted', 'ended', 'playing', 'paused', 'buffering', 'cued'. 
	 */
	onStateChange: nullFn,
	
	/**
	 * List of videos we want to play.  string or string[]
	 */
	playlist: [],
	
	/**
	 * Enables or disables javascript control creation
	 */
	createControls: false,
	
	/**
	 * Enables high quality video feed option.  May not work for all videos.
	 * Since the method used to access the high quality feed is undocumented, this feature may break in the future.
	 * TODO: make detectable?
	 */
	highQuality: false,
	
	/**
	 * URL path to Express Flash installer for Internet Explorer.
	 * For use with SWFObject plugin.
	 */
	expressUrl: null
}

/**
  * Plugin command interpreter
  * Returns the jQuery selector when initializing
  * Returns an object if passing an option.  The object is a value for the first item in the selector.
  */
$.fn.youtube = function(options) {
	var returnVal, 
		args = Array.prototype.slice.call(arguments, 1),
		stringArg = typeof options == "string";
	
	this.each(function() {
		if (stringArg) {
			var fn = $.data(this, dataId);
			var value = fn ? fn[options].apply(fn, args) : null;
			if(!returnVal) {
				returnVal = value;
			}
		} 
		
		// initialize the player with options
		else if (!$(this).data(dataId)) {
			return $.data(this, dataId, new youtube(this, options));
		}
	});
	
	return stringArg ? returnVal : this;
}

/**
 * Embeds a YouTube player into an HTML object.
 *
 * buildId: string ID for the embed object that will be created -- this is the ID through which
 *			the YouTube API will be accessed.
 * insertId: string ID for the already existant HTML object where the video should appear
 * swf: remote Flash SWF link for the YouTube API of choice
 * width: width of the embed object to be built
 * height: height of the embed object to be built
 */
var buildYouTubePlayer = function(buildId, insertId, swf, width, height, bgcolor, highQuality, expressUrl)
{
	if(window.swfobject) {
		// Load YouTube player
		var params = { 
			allowScriptAccess: "always",
			bgcolor: bgcolor, 
			wmode: "opaque" 
		}
		
		var atts = { 
			id: buildId 
		}
		
		var flashvars = {
			enablejsapi: 1,
			playerapiid: insertId
		}
		
		// This is undocumented and may break in the future
		if(highQuality) {
			//fmt=18
			flashvars.ap = '%2526fmt%3D18';
		}
		
		//swfobject.embedSWF(swfUrl, id, width, height, version, expressInstallSwfurl, flashvars, params, attributes)
		swfobject.embedSWF(swf, insertId, width, height, "8", expressUrl, flashvars, params, atts);
	}
	else {
		$('#' + insertId).html('Unable to locate swfobject flash loader');
	}
};

/**
 * Defines a global collection that will contain event listener functions.
 * A global var is required to support the Flash External Interface
 */
stateChangeListener = window[stateChangeListenerFn] = {};

// If the You Tube On Ready is expected by someone else, we will call it after	 
if(window.onYouTubePlayerReady) {
	onReadyOld = window.onYouTubePlayerReady;
}

/**
 * Default onready function as specified in the youtube javascript api
 */
window.onYouTubePlayerReady = function(playerId) {
	// Get the function associated with this player
	var player = players[playerId]		
	if(player) {
		var options = player.options;
		
		// create reference to the flash player
		var flashObject = $('#' + playerId);
		
		if(flashObject.length > 0) {
			player.flashPlayer = flashObject[0];
			
			//  create listener function for state change event handling
			player.flashPlayer.addEventListener("onStateChange", 
				stateChangeListenerFn + '.' + playerId);
			
			// Check if any items were added to the playlist
			if(options.playlist && options.playlist.length > 0) {
				var videoId = options.playlist[0];
				
				// Check if autoplay was set. If so, start playback immediately
				if(options.autoplay) {
					player.load(videoId);
				}
				
				// Otherwise, cue the video to display preview to user
				else {
					player.cue(videoId);
				}
			}
		}
		
		var eventData = [player, playerId];
		
		// Call the onready function if it was defined
		if(options.onReady) {
			options.onReady.apply(this, eventData);
		}
		
		// Trigger custom jquery YouTubeReady events
		$(player.element).trigger('YouTubeReady', eventData);
		$.event.trigger('YouTubeReadyGlobal', eventData);
	}

	// Call any previously defined onReady functions
	if(onReadyOld) {
		onReadyOld.apply(this, arguments);
	}
}

/**
 * Loads the flash player.
 * If a video id or playlist is specified, the first video will be loaded/cued.
 * @param container {DOM Object} 
 * @param options {Object} An associative array that contains option settings for this specific YouTube plugin object
 */
var youtube = function(container, options) {
	// Create reference to the jQuery object
	this.element = container;
	
	// Variable to keep track of the currently loaded Video ID
	this.currentVideoId = null;
	
	// Attempt to keep track of the current state
	this.currentState = -1;
	
	// Create options object using default options as a base
	this.options = options = $.extend({}, defaultOptions, options);
	
	// Keeps track of any existing onYouTubePlayerReady and onStateChange event handlers
	var onReadyOld,
		playerId = options.playerId, 
	// Reference to this function for anonymous functions declared within
		player = this;

	// If playlist is a string, convert to array
	if(typeof options.playlist == "string") {
		options.playlist = [options.playlist];
	}
	
	// If playerId is null, find an unused id
	for(var i = 0; playerId == null || $('#' + playerId).length > 0; i++) {
		playerId = defaultControlPrefix + i;
	}
	options.playerId = playerId;
	players[playerId] = this;
	
	// TODO: Create javascript controls for this player
	
	$(container).html('<div id="' + playerId + '"></div>');
	
	// Create the on state change event listener
	stateChangeListener[playerId] = function(state) {
		this.currentState = state;
		
		var eventData = [player, playerId, state, states[state]];
		
		// Call the onstatechange function if it was defined
		if(options.onStateChange) {
			options.onStateChange.apply(this, eventData);
		}
		
		// Call the onPlay function if it was defined
		if(state == 1 && options.onPlay) {
			options.onPlay.apply(this, eventData);
		}
		
		// Call the onPause function if it was defined
		if(state == 2 && options.onPause) {
			options.onPause.apply(this, eventData);
		}
		
		// Call the onStop function if it was defined
		// Is this correct? (state 0 is ended)
		if(state == 0 && options.onStop) {
			options.onStop.apply(this, eventData);
		}
		
		if(state == 5 && options.onReady) {
			options.onReady.apply(this, eventData);
		}
		
		// Trigger custom jquery YouTubeStateChange event
		$(container).trigger('YouTubeStateChange', eventData);
		$.event.trigger('YouTubeStateChangeGlobal', eventData);
	}
	
	// Create the flash player using SWFObject
	buildYouTubePlayer(playerId, playerId, options.playerUrl, 
		options.width, options.height, options.backgroundColor, options.highQuality, options.expressUrl);
}

/** 
 * Public functions
 */
youtube.prototype = {
	/**
	 * Loads a  video and starts playing
	 * @param videoId {string} video ID to load
	 * @param startSeconds {string/int} default starting time
	 */
	load: function(videoId, startSeconds) {
		if (this.flashPlayer && this.flashPlayer.loadVideoById) {
			this.currentVideoId = videoId;
			try { this.flashPlayer.loadVideoById(videoId, parseInt(startSeconds)); } catch(e) {}
		}
	},
	
	/**
	 * Cues a video for playback
	 * @param videoId {string} video ID to cue
	 */
	cue: function(videoId, startSeconds) {
		if (this.flashPlayer && this.flashPlayer.cueVideoById) {
			this.currentVideoId = videoId;
			try { this.flashPlayer.cueVideoById(videoId, parseInt(startSeconds || 0)); } catch(e) {}
		}
	},
	
	/**
	 * Start/Resume playback
	 * If a videoId is passed and it is different than the current video being played, then start new video playback.
	 * If videoId exists in the playlist, the playlist position will be updated.
	 * If videoId doesn't exist in the playlist, it will be added to the end of the playlist
	 */
	play: function(videoId) {
		if (this.flashPlayer && this.flashPlayer.playVideo) {
			try{ this.flashPlayer.playVideo(); } catch(e) {}
			if(this.options && this.options.onPlay) {
				this.options.onPlay();
			}
		}
	},
	
	/**
	 * Pause playback
	 */
	pause: function() {
		if (this.flashPlayer && this.flashPlayer.pauseVideo) {
			try{ this.flashPlayer.pauseVideo(); } catch(e){}
			if(this.options && this.options.onPause) {
				this.options.onPause();
			}
		}
	},
	
	/**
	 * Pause playback and reset the time to 0:00
	 */
	stop: function() {
		if (this.flashPlayer && this.flashPlayer.stopVideo) {
			try{ this.flashPlayer.stopVideo(); } catch(e){}
		}
	},
	
	/**
	 * Seeks to a specific time and starts playback
	 * @param seconds {number} Position in seconds from start
	 */
	seek: function(seconds) {
		if (this.flashPlayer && this.flashPlayer.seekTo) {
			try{ this.flashPlayer.seekTo(seconds, true); } catch(e) {}
		}
	},
	
	/**
	 * Seeks to a specific percent of total duration and starts playback
	 * @param seconds {number} Percent of total duration to start playback (1-100)
	 */
	seekPercent: function(percent) {
		if (this.flashPlayer && this.flashPlayer.seekTo) {
			try{ this.flashPlayer.seekTo((percent / 100) * this.getDuration(), true); } catch(e) {}
		}
	},
	
	/**
	* Plays the next video in the playlist if one exists
	* Returns the video ID of the new video, or null if no video exists
	*/
	next: function() {
		if (this.flashPlayer && this.options.playlist && this.options.playlist.length > 0) {
			var currentPos = $.inArray(this.options.playlist);
			var nextPos = currentPos + 1;
			if(nextPos < this.options.playlist.length) {
				var videoId = this.options.playlist[nextPos];
				this.load(videoId);
				return videoId;
			}
		}
	},
	
	/**
	 * Plays the previous video in the playlist if one exists
	 * Returns the video ID of the new video, or null if no video exists
	 */
	previous: function() {
		if (this.flashPlayer && this.options.playlist && this.options.playlist.length > 0) {
			var currentPos = $.inArray(this.options.playlist);
			if(currentPos > 0) {
				var videoId = this.options.playlist[currentPos - 1];
				this.load(videoId);
				return videoId;
			}
		}
	},
	
	/**
	 * Returns the state of the flash player
	 * @return {string} State Number
	 */
	getState: function() {
		if(this.flashPlayer && this.flashPlayer.getPlayerState) {
			try{ return this.flashPlayer.getPlayerState(); } catch(e) {}
		}
	},
	
	/**
	 * Resets the flash player to not have a video loaded.
	 */
	clearVideo: function() {
		if(this.flashPlayer && this.flashPlayer.clearVideo) {
			try{ return this.flashPlayer.clearVideo(); } catch(e) {}
		}
	},
	
	/**
	 * Returns the current volume level set on the flash player
	 */
	getVolume: function() {
		if(this.flashPlayer && this.flashPlayer.getVolume) {
			try{ return this.flashPlayer.getVolume(); } catch(e) {}
		}
	},
	
	/**
	 * Returns the length in seconds of the currently loaded video
	 */
	getDuration: function() {
		if(this.flashPlayer && this.flashPlayer.getDuration) {
			try{ return this.flashPlayer.getDuration(); } catch(e) {}
		}
		return -1;
	},
	
	/**
	 * Returns the current time play position
	 */
	getCurrentTime: function() {
		if(this.flashPlayer && this.flashPlayer.getCurrentTime) {
			try{ return this.flashPlayer.getCurrentTime(); } catch(e) {}
		}
		return -1;
	},
	
	/** 
	 * Returns the percent value (0-100) that represents the play position
	 */
	getPercentPlayed: function() {
		if(this.flashPlayer) {
			return parseFloat(this.getCurrentTime()) / parseFloat(this.getDuration()) * 100;
		}
		return 0;
	},
	
	/**
	 * Removes all traces of this plugin from the target control
	 */
	destroy: function() {
		if (this.flashPlayer) {
			try{ this.flashPlayer.stopVideo(); } catch(e) {}
			$(this.element).data(dataId, null).empty();
			this.flashPlayer = null;
		}
	}
}

/** 
 * Define 'static' methods
 */
$.youtube = $.extend( 
function(options) {
	var args = Array.prototype.slice.call(arguments, 1);
	if (typeof options == "string") {
		return $.youtube[options].apply(this, args);
	}
},
{
	/** 
	 * Stop all Youtube Players
	 */
	stop: function() {
		$.each(players, function() {
			this.stop();
		});
	},
	
	/** 
	 * Pause all Youtube Players
	 */
	pause: function() {
		$.each(players, function() {
			this.pause();
		});
	},

	/** 
	 * Start all Youtube Players
	 */
	play: function() {
		$.each(players, function() {
			this.play();
		});
	},
	
	/**
	 * Returns an associative array containing all youtube player objects keyed by player id.
	 */
	list: function() {
		return $.extend({}, players);
	},
	
	/** 
	 * Gets a player object by player ID
	 */
	getPlayer: function(playerId) {
		return players[playerId];
	},
	
	/** 
	* Returns the string value of a player state number
	*/
	getStateText: function(state) {
		return states[state];
	},
	
	/** 
	 * Formats a number to hh:mm:ss time string
	 */
	formatTime: function(s) {
		var time = parseInt(s);
		var timeString = '';
		var hasHours = false;
		if(time > 3600) {
			var hours = parseInt(time / 3600);
			time -= hours * 3600;
			hasHours = true;
			timeString += hours + ':';
		}
		var minutes = parseInt(time / 60);
		time -= minutes * 60;
		if(minutes < 10) {
			timeString += '0';
		}
		timeString +=  minutes + ':';
		if(time < 10) {
			timeString += '0';
		}
		timeString += time;
		return timeString;
	}
});

})(jQuery);
