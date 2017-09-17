var init = function()
{
	// startup Restify server
	var server = Restify.createServer({'name': 'madsonic-songservice'});
	server.use(Restify.fullResponse());
	server.use(Restify.bodyParser());
	server.use(Restify.queryParser());

	server.on("uncaughtException", onUncaughtException);
	server.use(mainHandler);

	server.get("/songs", getSongs);
	server.get("/search", searchSongs);

	server.listen(config.port, serverUpHandler);

	Winston.info("Server listening through port " + config.port + ".");
}

var mainHandler = function(request, result, next)
{
	// recreate url
	Winston.verbose(request.method + ": " + request.url);
	next();
};

var onUncaughtException = function(request, response, route, err)
{
	Winston.error("Uncaught Exception:\n", err);
	response.send(err); // Resume default behaviour.
}

var serverUpHandler = function()
{
	Winston.log('info', 'Restify server up and running on port ' + config.port);
};


// ================== //
// HANDLER FUNCTIONS: //
// ================== //

var divideSongs = function(folders, size)
{
	var result = [];
	var folderObj = {};
	for(i = 0; i < folders.length; i++)
	{
		folderObj[folders[i].id] = 0;
	}

	for(i = 0; i < size; i++)
	{
		var index = Math.floor((Math.random() * folders.length));
		folderObj[folders[index].id]++;
	}

	for(i = 0; i < folders.length; i++)
	{
		if(folderObj[folders[i].id])
		{
			result.push({id: folders[i].id, size: folderObj[folders[i].id]});
		};
	}

	return result;
};

var getSongs = function(request, response, next)
{
	if(request.params.type === "random")
	{
		// random, by year
		Winston.info("random songs");
		getFolders(request.params.user, request.params.pass, function(err, folders)
		{
			getRandomSongs(folders, request.params.user, request.params.pass, request.params.fromYear, request.params.toYear, request.params.size, function(err, songs)
			{
				response.send(songs);
			});
		});
	}

	next();
};

var getFolders = function(user, pass, callback)
{
	var options = JSON.parse(JSON.stringify(_httpOptions));
	options.url = config.api.madsonic.location;
	var client = Restify.createJSONClient(options);

	var endpoint = '/rest2/getMusicFolders.view';
	endpoint += '?v=2.5.0&c=work-pc-rest&f=json&u=' + user;
	endpoint += '&p=' + pass;

	Winston.info("Calling API with url: " + endpoint);
	client.get(endpoint, function(err, req, resp, object)
	{
		callback(err, object["madsonic-response"].musicFolders.musicFolder);
	});
};

var getRandomSongs = function(folders, user, pass, from, to, size, callback)
{
	var options = JSON.parse(JSON.stringify(_httpOptions));
	options.url = config.api.madsonic.location;
	var client = Restify.createJSONClient(options);

	var endpoint = '/rest2/getRandomSongs.view';
	endpoint += '?v=2.5.0&c=work-pc-rest&f=json&u=' + user;
	endpoint += '&p=' + pass;

	// by year?
	if(from)
	{
		endpoint += '&fromYear=' + from;
		endpoint += '&toYear=' + to;
	}

	// determine division of songs per folder
	var chosenFolders = divideSongs(folders, size);

	var songs = [];

	Async.each(chosenFolders, function(folder, callback)
	{
		Winston.info("Calling API with url: " + endpoint + "musicFolderId=" + folder.id + "&size=" + folder.size);
		client.get(endpoint + "&musicFolderId=" + folder.id + "&size=" + folder.size, function(err, req, resp, object)
		{
			if(!err) songs.push.apply(songs, object["madsonic-response"].randomSongs.song);
			callback(err);
		});
	},
	function(err)
	{
		// shuffle array before returning
		Shuffle(songs);

		callback(err, songs);
	});

};

var searchSongs = function(request, response, next)
{
	// set vars
	var query = {
		artist: request.params.artist,
		song: request.params.song
	};
	var searchQuery = query.artist + " " + query.song;

	// prepare rest call
	var options = JSON.parse(JSON.stringify(_httpOptions));
	options.url = config.api.madsonic.location;
	var client = Restify.createJSONClient(options);

	var endpoint = '/rest2/searchID3.view';
	endpoint += '?v=2.5.0&c=work-pc-rest&f=json&u=' + _user;
	endpoint += '&p=' + _pass;
	endpoint += '&query=' + encodeURIComponent(searchQuery);

	// make rest call
	Winston.info("Calling API with url: " + endpoint);
	client.get(endpoint, function(err, req, resp, object)
	{
		// loop through songs and fond the correct one
		var songs = object["madsonic-response"].searchResultID3.song;
		var song;
		var songFound = null;
		var i = 0; iLen = songs.length;
		for(i; i < iLen; i++)
		{
			song = songs[i];
			if(song.artist.toLowerCase() == query.artist.toLowerCase() && song.title.toLowerCase() == query.song.toLowerCase())
			{
				songFound = song;
				break;
			}
		};

		// send response
		if(!songFound) return response.send(404);
		response.send(songFound);
	});

	next();
};

// init requirements:
var Async   = require('async');
var Shuffle = require('shuffle-array');
var Restify = require('restify');
var Winston = require("./node_logging/logger.js")("madsonic-songservice");

// config
var config = require('./config.json');
Winston.info("Started with the following config:\n", JSON.stringify(config));

// init vars
var _httpOptions = {
	headers: {
		"Content-Type": "application/json"
	},
	retry: {
	'retries': 0
	},
	agent: false
};

var _user = "admin";
var _pass = "admin";

init();