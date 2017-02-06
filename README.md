## Stream Examples

Streams in node.js have some interesting behaviors. The repository is intended to make streams easier to comprehend, through examples.

## Examples
1. Backpressure - Show what the source and sink buffers are doing when production is faster than consumption. `node lib/backpressure.js`

2. Errors - Show what happens when on source and sink errors, how 'unpipe' works. `node lib/errors.js`

3. Flowing - Track the paused and flowing state of a stream. This doesn't make sense to me, as neither the flowing nor paused state of the source stream seems related to the state of the buffers. `node lib/flowing.js`
