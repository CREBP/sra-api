var _ = require('lodash');
var events = require('events');
var request = require('superagent');
var util = require('util');

function SRAAPI() {
	/**
	* Superagent instance representing this object
	* @var {Superagent}
	*/
	this.agent = request.agent();


	/**
	* Config for this instance
	* @param {Object}
	*/
	this.config = {
		url: 'http://glitch',
		pollFreq: 1000, // How often in ms to poll the server to ask about a task status
	};


	/**
	* Utility function to handle server responses
	* This will handle:
	* 	- Standard callback errors
	* 	- Server errors (statusCode != 200)
	*/
	this._handleResponse = function(err, res, callback) {
		if (!_.isFunction(callback)) return;
		if (err) return callback(err);
		if (res.statusCode != 200) return callback('Status code: ' + res.statusCode);
		callback(null, res.body);
	};


	/**
	* Login to the SRA using standard auth user/pass and return the user profile in the callback
	* @param {string} username The username to login with
	* @param {string} password The password to login with
	* @param {function} [callback] Optional callback to call on completion
	*/
	this.login = function(username, password, callback) {
		this.agent.post(this.config.url + '/api/users/login')
			.send({username: username, password: password})
			.end((err, res) => this._handleResponse(err, res, callback));
	};


	/**
	* Upload a file to the SRA and return the task that will process it in the callback
	* @param {string} file The file to upload
	* @param {Object} [settings] Settings to use when uploading
	* @param {string} [settings.libraryTitle] The title to use when uploading the library
	* @param {string} [settings.library] Existing library ID to merge with
	* @param {function} [callback] Optional callback to call with the task on completion
	* @return {Object} This chainable object
	*/
	this.upload = function(file, settings, callback) {
		// FIXME: make settings optional

		var req = this.agent.post(this.config.url + '/api/libraries/import')
			.attach('file', file)

		// Map all fields - annoying we can't just pass an object to this
		_.forEach(settings, (v, k) => req.field(k, v));

		req.end((err, res) => this._handleResponse(err, res, callback));

		return this;
	};

	
	/**
	* Queue a task to be executed on a library
	* @param {string} library The library ID to execute the task on
	* @param {string} task The task alias to execute
	* @param {Object} settings Additional task settings
	* @param {function} [callback] Optional callback to call with the task on completion
	* @return {Object} This chainable object
	*/
	this.taskQueue = function(library, task, settings, callback) {
		this.agent.post(this.config.url + '/api/tasks/library/' + library + '/' + task)
			.send({settings: settings || {}})
			.end((err, res) => this._handleResponse(err, res, callback));

		return this;
	};


	/**
	* Wait for a task to complete
	* This function works by polling the server for the task. The poll frequence is specified in `config.pollFreq`
	* NOTE: This will NOT timeout
	* @param {string} task The task ID to wait for
	* @param {function} [callback] Optional callback to call with the task on completion
	* @param {function} [callbackProgress] Optional additional parameter to pass task progress to
	* @return {Object} This chainable object
	*/
	this.taskWait = function(task, callback, callbackProgress) {
		var self = this;
		var checkTask = function() {
			self.agent.get(self.config.url + '/api/tasks/' + task)
				.end(function(err, res) {
					if (err) {
						callback(err);
					} else if (res.body._id && res.body.status) {
						switch (res.body.status) {
							case 'completed':
								self._handleResponse(err, res, callback);
								break;
							case 'pending':
								setTimeout(checkTask, self.config.pollFreq);
								break;
							case 'error':
								callback('Task error'); // FIXME: Is there something we can do here to provide more info?
								break;
							case 'processing':
								if (_.isFunction(callbackProgress)) { // Is there a progress function?
									res.body.progress.percent = Math.ceil(res.body.progress.current / res.body.progress.max * 100); // Glue percent onto progress to be helpful
									callbackProgress(res.body);
								}

								setTimeout(checkTask, self.config.pollFreq);
								break;
							default:
								callback('Unknown server task status: ' + res.status);
						}
					} else {
						callback('Empty response');
					}
				});
		};
		checkTask();

		return this;
	};


	/**
	* Get all references in a library
	* @param {string} library The libraryID to retrieve
	* @param {function} [callback] Optional callback to call with the task on completion
	* @return {Object} This chainable object
	*/
	this.getLibraryReferences = function(library, query, callback) {
		this.agent.get(config.url + '/api/references')
			.query(_.merge({}, {library: library._id}, query))
			.end((err, res) => this._handleResponse(err, res, callback));

		return this;
	};

	return this;
}

util.inherits(SRAAPI, events.EventEmitter);

module.exports = new SRAAPI();
