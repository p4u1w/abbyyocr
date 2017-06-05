'use strict'

const request = require("request")
const fs = require('fs')
const S3 = require('s3')
const xml2js = require('xml2js')
const async = require('async')

const s3 = S3.createClient({
  s3Options: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  }
})

class SDK {
  /**
 * Create a new ocrsdk object.
 * 
 * @constructor
 * @param {string} applicationId  Application Id.
 * @param {string} password     Password for the application you received in e-mail.
 * @params {object} settings    Settings to specify behavior of processing
 * To create an application and obtain a password,
 * register at http://cloud.ocrsdk.com/Account/Register
 * More info on getting your application id and password at
 * http://ocrsdk.com/documentation/faq/#faq3
 */
  constructor(applicationId, password, settings) {
    this.applicationId = applicationId
    this.password = password
    this.settings = new ProcessingSettings(settings)
    this.serverUrl = "http://cloud.ocrsdk.com"
  }

/**
 * Processes the given image
 * 
 * @param {string} filePath  Path to the image file to process
 * @param {string} [processType] What kind of processing to do on image (Default is 'image')
 * @param {function} callback Returns the results of the processing
 */
  process(filePath, processType, callback) {
    async.auto({
      sendRequest: done => {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          userCallback(new Error("file " + filePath + " doesn't exist"), null)
          return
        }

        // processType is optional so if it is a func, that means it wasn't filled
        if (typeof processType === 'function') {
          callback = processType
          processType = 'image'
        }

        if (this.settings.uploadToS3) {
          uploadToS3(Object.assign({ localFile: filePath, key: localFile.split('/').slice(-1).split('.')[0] }, this.settings.s3))
        }

        var urlOptions = this.settings.asUrlParams()
        var req = this._createTaskRequest('POST', `/process${imageType}` + urlOptions,
            callback)

        req.body = fs.readFileSync(filePath)
        req.end()
      },
      waitForResponse: [ 'sendRequest', (task, done) => {
        // Wait for however long it says it should be, then continue.
        // Abbyy recommends waiting at least 2 seconds.
        waitForCompletion(task.id[0], done)
      }],
      downloadResults: [ 'waitForResponse', (task, done) => {
        downloadResult(task.resultUrl[0], done)
      }]
    }, callback)
  }
 }

 /**
 * Convert processing settings to string passed to RESTful request.
 */
class ProcessingSettings {
  constructor (settings) {
    this.s3 = settings.s3
    this.uploadToS3 = !!settings.uploadToS3
    this.urlParams = settings.urlParams
  }

  asUrlParams() {
    return Object.keys(this.urlParams)
      .map((key) => `${key}=${this.urlParams[key]}`)
      .join('&')
  }
}

/**
 * Uploads given image to S3
 * 
 * @param {object} params Parameters to use to write to s3
 */
const uploadToS3 = function(params) {
  return s3.uploadFile({ 
    localFile: params.localFile, 
    s3Params: {
      Bucket: params.bucket,
      Key: params.key
    }
  })
}

/**
 * Get current task status.
 * 
 * @param {string} taskId             Task identifier as returned in taskData.id.
 * @param {function(error, taskData)} callback  The callback function.
 */
const getTaskStatus = function(taskId, callback) {
  var req = this._createTaskRequest('GET', '/getTaskStatus?taskId=' + taskId,
      callback)
  req.end()
}

const isTaskActive = function(taskData) {
  return taskData.status === 'Queued' || taskData.status === 'InProgress'
}

const waitForCompletion = function(taskId, callback) {
  // Call getTaskStatus every several seconds until task is completed

  // Note: it's recommended that your application waits
  // at least 2 seconds before making the first getTaskStatus request
  // and also between such requests for the same task.
  // Making requests more often will not improve your application performance.
  // Note: if your application queues several files and waits for them
  // it's recommended that you use listFinishedTasks instead (which is described
  // at http://ocrsdk.com/documentation/apireference/listFinishedTasks/).

  if (taskId.indexOf('00000000') > -1) {
    // A null Guid passed here usually means a logical error in the calling code
    userCallback(new Error('Null id passed'), null)
    return
  }
  var recognizer = this
  var waitTimeout = 5000

  function waitFunction() {
    getTaskStatus(taskId,
      function(error, taskData) {
        if (error) {
          userCallback(error, null)
          return
        }

        console.log("Task status is " + taskData.status)

        if (isTaskActive(taskData)) {
          setTimeout(waitFunction, waitTimeout)
        } else {

          userCallback(null, taskData)
        }
      })
  }
  setTimeout(waitFunction, waitTimeout)
}

/**
 * Download result of document processing. Task needs to be in 'Completed' state
 * to call this function.
 * 
 * @param {string} resultUrl        URL where result is located
 * @param {string} outputFilePath       Path where to save downloaded file
 * @param {function(error)} userCallback  The callback function.
 */
const downloadResult = function(resultUrl, callback) {
  var parsed = url.parse(resultUrl)

  request(parsed, (err, res, body) => {
    if (err) {
      return callback(err)
    }

    xml2js.parseString((err, result) => {
      callback(null, body)
    })
  })

  req.end()
}

/**
 * Create http GET or POST request to cloud service with given path and
 * parameters.
 * 
 * @param {string} method         'GET' or 'POST'.
 * @param {string} urlPath        RESTful verb with parameters, e.g. '/processImage/language=French'.
 * @param {function(error, TaskData)}   User callback which is called when request is executed.
 * @return {http.ClientRequest}     Created request which is ready to be started.
 */
const _createTaskRequest = function(method, urlPath,
    taskDataCallback) {

  /**
   * Convert server xml response to TaskData. Calls taskDataCallback after.
   * 
   * @param data  Server XML response.
   */
  function parseXmlResponse(data) {
    var response = null

    var parser = new xml2js.Parser({
      explicitCharKey : false,
      trim : true,
      explicitRoot : true,
      mergeAttrs : true
    })
    parser.parseString(data, function(err, objResult) {
      if (err) {
        taskDataCallback(err, null)
        return
      }

      response = objResult
    })

    if (response == null) {
      return
    }

    if (response.response == null || response.response.task == null
        || response.response.task[0] == null) {
      if (response.error != null) {
        taskDataCallback(new Error(response.error.message[0]['_']), null)
      } else {
        taskDataCallback(new Error("Unknown server response"), null)
      }

      return
    }

    var task = response.response.task[0]

    taskDataCallback(null, task)
  }

  function getServerResponse(res) {
    res.setEncoding('utf8')
    res.on('data', parseXmlResponse)
  }

  var requestOptions = url.parse(this.serverUrl + urlPath)
  requestOptions.auth = this.appId + ":" + this.password
  requestOptions.method = method
  requestOptions.headers = {
    'User-Agent' : "node.js client library"
  }

  var req = request(requestOptions, getServerResponse)

  req.on('error', function(e) {
    taskDataCallback(e, null)
  })

  return req
}

exports.create = function(applicationId, password, options) {
  return new SDK(applicationId, password, options)
}
