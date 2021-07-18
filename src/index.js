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
  { createWriteStream, mkdir, symlink } = require('fs'),
  { join: joinPath, dirname } = require('path');

const [isFork, filePattern, baseFolder] = process.argv.slice(2);

if(isFork === 'fork'){
  pipeline(
    tarGlob({
      globs: [filePattern],
      base_folder: baseFolder
    }),
    process.stdout,
    (err)=> process.exit(err ? 1 : 0)
  );
  
  return;
}

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
  
  const tarStream = fork(__filename, ['fork', filePattern, baseFolder], { silent: true }).stdout;
  
  up({
      ga_api_base_url: gaApiBaseUrl,
      ga_api_token: gaApiToken,
      ga_run_id: gaRunId,
      artifact_name: artifactName,
      artifact_stream: tarStream,
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
        header.type === "file"
          ? kefir
              .fromNodeCallback((cb)=> {
                pipeline(
                  stream,
                  createWriteStream(joinPath(baseFolder, header.name), { mode: header.mode }),
                  cb
                );
              })
          : (function(){
            stream.resume();
            return kefir.fromNodeCallback((cb)=> symlink(joinPath(baseFolder, header.name), header.linkname));
          })()
      ])
      .onError(()=> console.error(header.name))
      .onValue(noop);
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
