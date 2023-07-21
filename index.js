'use strict';

const opentelemetry = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { BasicTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { createHash } = require('node:crypto');

const publicKey = '44073d050af5b2f09c4e2ba29c76068c';
const privateKey = 'd3a06fe23cae128bb64c1ff747416cad58e8584c';

const provider = new BasicTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'heroes-test',
  }),
});

// Configure span processor to send spans to the exporter
const exporter = new JaegerExporter({
  endpoint: 'http://localhost:14268/api/traces',
});
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

/**
 * Initialize the OpenTelemetry APIs to use the BasicTracerProvider bindings.
 *
 * This registers the tracer provider with the OpenTelemetry API as the global
 * tracer provider. This means when you call API methods like
 * `opentelemetry.trace.getTracer`, they will use this tracer provider. If you
 * do not register a global tracer provider, instrumentation which calls these
 * methods will receive no-op implementations.
 */
provider.register();
const tracer = opentelemetry.trace.getTracer('heroes-test-tracer');

const express = require('express');
const app = express();
const port = 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/', async (req, res) => {
  const parentSpan = tracer.startSpan('Get Heroes');
  const heroes = await fetchHero(parentSpan);
  const heroesRandom = await heroesRandomizer(parentSpan, heroes);
  parentSpan.end();
  res.send(heroesRandom)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

// gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  exporter
    .shutdown()
    .then(
      () => console.log('SDK shut down successfully'),
      (err) => console.log('Error shutting down SDK', err),
    )
    .finally(() => process.exit(0));
});

async function fetchHero(parent) {
  // Start another span. In this example, the main method already started a
  // span, so that'll be the parent span, and this will be a child span.
  const ctx = opentelemetry.trace.setSpan(opentelemetry.context.active(), parent);
  const span = tracer.startSpan('Fetch Heroes', undefined, ctx);

  // Generate a timestamp
  const timestamp = Date.now();

  span.addEvent('Generating Hash');
  // Generate the hash
  const hash = createHash('md5').update(timestamp + privateKey + publicKey).digest('hex');

  const fetchStart = Date.now();
  // Create the API request URL with the required parameters
  const apiUrl = `https://gateway.marvel.com/v1/public/characters?ts=${timestamp}&apikey=${publicKey}&hash=${hash}&limit=50&offset=${Math.floor(Math.random() * 30)*50}`;

  const heroes = fetch(apiUrl)
    .then(response => response.json())
    .then(data => data.data.results)
    .catch(error => console.error(error));
  span.addEvent('Heroes retrieved', fetchStart);
  // Set attributes to the span.
  span.setAttribute('hash', hash);

  span.end();

  return heroes;
}

async function heroesRandomizer(parent, heroes) {
  // Start another span. In this example, the main method already started a
  // span, so that'll be the parent span, and this will be a child span.
  const ctx = opentelemetry.trace.setSpan(opentelemetry.context.active(), parent);
  const span = tracer.startSpan('Randomizing Heroes', undefined, ctx);

  const hero1 = heroes[Math.floor(Math.random() * heroes.length)];
  let hero2 = heroes[Math.floor(Math.random() * heroes.length)];
  // Make sure hero2 is not the same as hero1
  while (hero2.id === hero1.id) {
    hero2 = heroes[Math.floor(Math.random() * heroes.length)];
  }


  span.addEvent('Hero 1', hero1);
  span.addEvent('Hero 2', hero2);

  span.end();

  return { heroes: [hero1, hero2] };
}
