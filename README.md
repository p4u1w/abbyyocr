## Abbyy OCR Wrapper for Node.js

This is a cleaned-up wrapper for the Abbyy OCR SDK. It is heavily inspired by https://github.com/abbyysdk/ocrsdk.com/blob/master/JavaScript/ocrsdk.js, and by "heavily inspired", I mean I re-wrote it so the code made more sense along with adding a few new doo-hickeys like uploading images to S3

### How do I use it? 

 * Call `create` (the only exported function) with your application ID (what the application is called), the application password that was emailed to you and options for processing. 
   * This function will return a class that has one function called `process`. 
 * `process` takes in the file path to the image, optionally what processing you want do (Image, Receipt, etc. Look [here](http://ocrsdk.com/documentation/apireference/) for the full list) and a callback. 
   * `process` will send it off the processing and call you back with a JSON object of the results. Woooo! So much easier than their original way. :) 

### Options to give when instantiate
 * `uploadToS3`: Whether images should be uploaded to S3 as they are processed
 * `s3`: Options for when uploading to S3
   * `bucket`: Name of the S3 bucket to upload to
   * Note: The key of the file will be the key of whatever the file is called
 * `urlParams`: Any option that Abbyy lists on their API reference. These options will be made into a URL query string and appended.