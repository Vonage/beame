const { Transform } = require('stream');

const
  MB = 1024 * 1024,
  DEFAULT_CHUNK_SIZE = 4 * MB;

const
  FIELD_BUFFER = Symbol('buffer'),
  FIELD_CHUNK_SIZE = Symbol('transform');

export class ChunkStream extends Transform {
  
  objectMode = false
  
  constructor({ chunk_size = DEFAULT_CHUNK_SIZE } = {}) {
    super();
    this[FIELD_CHUNK_SIZE] = chunk_size;
    this[FIELD_BUFFER] = Buffer.alloc(0);
  }
  
  _pushToBuffer(chunk){
    
    const
      chunkSize = this[FIELD_CHUNK_SIZE],
      currentBuffer = Buffer.concat([this[FIELD_BUFFER], chunk]);
    
    for(let i = 0; i < ~~(currentBuffer.length / chunkSize); i++){
      this.push(currentBuffer.slice(i * chunkSize, (i + 1) * chunkSize));
    }
    
    this[FIELD_BUFFER] = currentBuffer.slice(currentBuffer.length - (currentBuffer.length % chunkSize));
  }
  
  _flush(callback){
    if(this[FIELD_BUFFER].length > 0) this.push(this[FIELD_BUFFER]);
    callback();
  }
  
  _transform(chunk, encoding, callback){
    this._pushToBuffer(chunk);
    callback();
  }
}
