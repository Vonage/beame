const
  kefir = require('kefir'),
  { Glob } = require('glob'),
  tar = require('tar-stream'),
  { createGzip } = require('zlib'),
  { pipeline } = require('stream'),
  { createReadStream, stat } = require('fs'),
  { join: joinPath } = require('path'),
  { always, get, noop } = require('lodash/fp');

const QUEUE_BUFFER = 1000;

module.exports = function({
  globs = [],
  base_folder: baseFolder,
}){
  
  const
    pack = tar.pack(),
    outputStream = pipeline(pack, createGzip({ level: 1 }), noop);
  
  kefir
    .merge([].concat(globs).map((globPattern)=> {
      const globber = new Glob(globPattern, { cwd: baseFolder, nodir: true, dot: true });
      return kefir
        .fromEvents(globber, 'match')
        .takeUntilBy(kefir.fromEvents(globber, 'end'));
    }))
    .bufferWithCount(QUEUE_BUFFER, { flushOnEnd: true })
    .flatMapConcat((relativePaths)=> {
      return kefir
        .concat(
          relativePaths
            .map((relativePath)=> {
              const fullPath = joinPath(baseFolder, relativePath);
              return kefir
                .fromNodeCallback((cb)=> stat(fullPath, cb))
                .map(get('size'))
                .flatMap((fileSize)=>{
                  return kefir
                    .fromPromise(
                      new Promise((resolve, reject) => {
                        pipeline(
                          createReadStream(fullPath, { autoClose: true, emitClose: true }),
                          pack.entry({ name: relativePath, size: fileSize }),
                          (err, end)=> (err ? reject : resolve)(err || end)
                        );
                      })
                    )
                })
                .map(always(relativePath))
            })
      );
    })
    .takeErrors(1)
    .onEnd(()=> pack.finalize());
  
  return outputStream;
};
