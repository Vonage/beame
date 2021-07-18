const
  kefir = require('kefir'),
  { Glob } = require('glob'),
  tar = require('tar-stream'),
  { createGzip } = require('zlib'),
  { pipeline } = require('stream'),
  { createReadStream, lstat, readlink } = require('fs'),
  { join: joinPath } = require('path'),
  { always, noop, partial } = require('lodash/fp');

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
                .fromNodeCallback((cb)=> lstat(fullPath, cb))
                .flatMap((stat)=> stat
                  .isSymbolicLink()
                    ? kefir
                        .fromNodeCallback((cb)=> readlink(fullPath, cb))
                        .map((link)=> ({
                          type: "link",
                          link
                        }))
                    : kefir
                      .constant({
                        type: "file",
                        size: stat["size"],
                        mode: stat["mode"]
                      })
                )
                .flatMap(({ size, mode, link, type }) => {
                  return type === "file"
                    ? kefir
                      .fromNodeCallback(
                        partial(
                          pipeline,
                          [
                            createReadStream(fullPath, { autoClose: true, emitClose: true }),
                            pack.entry({ type: "file", name: relativePath, size, mode })
                          ]
                        )
                      )
                    : (function(){
                      pack.entry({ type: "symlink", name: relativePath, linkname: link });
                      return kefir.never();
                    })();
                })
                .map(always(relativePath))
            })
      );
    })
    .takeErrors(1)
    .onEnd(()=> pack.finalize());
  
  return outputStream;
};
