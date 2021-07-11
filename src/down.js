const
  got = require('got'),
  kefir = require('kefir'),
  { pipeline, PassThrough } = require('stream'),
  { pipe, filter, get, map, orderBy, equals } = require('lodash/fp');

const
  HTTP_CLIENT_CONCURRENCY = 4,
  GA_API_VERSION = "6.0-preview";

module.exports = function({
  ga_api_base_url: gaApiBaseUrl,
  ga_api_token: gaApiToken,
  ga_run_id: gaRunId,
  artifact_name: artifactName
}){
  
  const inStream = new PassThrough();
  const artifactBaseUrl = `${gaApiBaseUrl}_apis/pipelines/workflows/${gaRunId}/artifacts`;
  const ghaStreamClient = (options)=>
    kefir
      .fromNodeCallback((cb)=> {
        got({
          throwHttpErrors: true,
          ...options,
          headers: {
            "Accept": `application/json;api-version=${GA_API_VERSION}`,
            "Authorization": `Bearer ${gaApiToken}`,
            ...(options["headers"] || {})
          },
        }).then(cb.bind(null, null), cb);
      });
  
  ghaStreamClient({
      url: artifactBaseUrl,
      searchParams: { "artifactName": artifactName },
      resolveBodyOnly: true,
      responseType: "json"
    })
    .map(get('value.0.fileContainerResourceUrl'))
    .flatMap((artifactUrl)=>
      ghaStreamClient({
        url: artifactUrl,
        resolveBodyOnly: true,
        responseType: "json"
      })
    )
    .flatten(pipe(
      get('value'),
      filter(pipe(get('itemType'), equals('file'))),
      orderBy([pipe(get('path'), (str)=> +(str.match(/([0-9]+)\.bin$/)[1]))], ['asc']),
      map(get('contentLocation'))
    ))
    .spy()
    .flatMapConcat((url)=>{
      return ghaStreamClient({
        url,
        resolveBodyOnly: true,
        responseType: 'buffer',
        headers: {
          "Accept": `application/octet-stream;api-version=${GA_API_VERSION}`
        }
      });
    })
    .onValue((buffer)=> inStream.write(buffer))
    .onEnd(()=> inStream.end());
  
  return inStream;
};
