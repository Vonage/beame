const
  { pipeline } = require('stream'),
  core = require('@actions/core'),
  up = require('./up.js'),
  down = require('./down.js'),
  tarGlob = require('./tar_glob'),
  kefir = require('kefir'),
  tar = require('tar-stream'),
  { fork } = require('child_process'),
  { createGunzip } = require('zlib'),
  { noop } = require('lodash/fp'),
  { createWriteStream, mkdir } = require('fs'),
  { join: joinPath, dirname } = require('path');

// Forked routine
(function([isFork, filePattern, baseFolder]){
  if(isFork === 'fork'){
    console.log('FORKED!', filePattern, baseFolder);
    process.exit(0);
    tarGlob({
      globs: [filePattern],
      base_folder: baseFolder
    }).pipe(process.stdout);
  }
})(process.argv.slice(2));

const [
  directionInput,
  patternInput,
  folderInput,
  artifactInput
] = ["direction", "pattern", "folder", "artifact"].map((inputName)=> core.getInput(inputName));

const [
  ACTIONS_RUNTIME_URL,
  ACTIONS_RUNTIME_TOKEN,
  GITHUB_RUN_ID,
] = ["ACTIONS_RUNTIME_URL", "ACTIONS_RUNTIME_TOKEN", "GITHUB_RUN_ID"].map((envName)=> process.env[envName]);

const MB = 1024 * 1024;

const beamUp = function({
  base_folder: baseFolder,
  file_pattern: filePattern,
  artifact_name: artifactName,
  ga_api_base_url: gaApiBaseUrl,
  ga_api_token: gaApiToken,
  ga_run_id: gaRunId,
}){
  up({
      ga_api_base_url: gaApiBaseUrl,
      ga_api_token: gaApiToken,
      ga_run_id: gaRunId,
      artifact_name: artifactName,
      artifact_stream: fork(__filename, ['fork', filePattern, baseFolder], { silent: false }).stdout,
      /*artifact_stream: tarGlob({
        globs: [filePattern],
        base_folder: baseFolder
      }),*/
      artifact_chunk_size: 4 * MB,
      http_concurrency: 1
    })
    .then(()=> console.log('Uploaded successfully!'))
    .catch(console.error);
};

const beamDown = function({
  base_folder: baseFolder,
  artifact_name: artifactName,
  ga_api_base_url: gaApiBaseUrl,
  ga_api_token: gaApiToken,
  ga_run_id: gaRunId,
}){
  
  const tarStream = pipeline(
    down({
      ga_api_base_url: gaApiBaseUrl,
      ga_api_token: gaApiToken,
      ga_run_id: gaRunId,
      artifact_name: artifactName
    }),
    createGunzip(),
    tar.extract(),
    (err)=> {
      console.log(`Finished %s`, err ? `with error(s):\n${err}` : 'successfully');
      process.exit(!!err ? 1 : 0);
    }
  );
  
  tarStream.on('entry', function(header, stream, next) {
    stream.once('end', next);
    kefir
      .concat([
        kefir.fromNodeCallback((cb)=> mkdir(joinPath(baseFolder, dirname(header.name)), { recursive: true }, cb)),
        kefir.fromNodeCallback((cb)=> {
          pipeline(
            stream,
            createWriteStream(joinPath(baseFolder, header.name)),
            cb
          );
        })
      ])
      .onError(()=> console.error(header.name))
      .onValue(()=> console.log(header.name));
  });
};

(({
  "up": beamUp,
  "down": beamDown
})[directionInput] || function(){ console.error(`direction "${ directionInput }" is unsupported`) })({
  base_folder: folderInput,
  file_pattern: patternInput,
  artifact_name: artifactInput,
  ga_api_base_url: ACTIONS_RUNTIME_URL,
  ga_api_token: ACTIONS_RUNTIME_TOKEN,
  ga_run_id: GITHUB_RUN_ID,
});

// Test
