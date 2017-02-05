'use strict'

const stream = require('stream')
const chalk = require('chalk')

const READ_COUNT = 10 // the number of times Source._read can be called before it pushes null
const READ_INTERVAL = 100 // ms
const WRITE_INTERVAL = 1000 // ms

/*
  With no highWaterMark set for source or sink, and a source producing faster than the sink can consume,
  chunks collect in the sink queue.

  With a highWaterMark on the sink, and a source producing faster than the sink can consume,
  chunks collect in the sink until the highWaterMark, then chunks collect in the readable queue while the sink
  empties its queue. Once the sink's queue is empty, it refills and repeats.

  With a highWaterMark on both the sink and the source, and a source producing faster than the sink can consume,
  chunks collect in the sink until the highWaterMark, then chunks collect in the source queue while the sink queue
  empties. If the sink queue isn't empty by the time the source queue hits its highWaterMark, source.push returns false
  and no more reads occur until the sink's queue empties.

*/

class Source extends stream.Readable {
  constructor(options) {
    super(options)
    this.count = 0
  }

  _read(size) {
    console.log(chalk.white.bgBlue(`Source._read - buffer length ${this._readableState.buffer.length}`))
    setTimeout(() => {
      let data = this.count > READ_COUNT ? null : `${(this.count++)} - some data to fill up the queues`
      const writeResponse = this.push(data)
      console.log(chalk.black.bgCyan(`Source._push response: ${writeResponse}`))
    }, READ_INTERVAL)
  }
}

class Sink extends stream.Writable {
  constructor(options) {
    super(options)
  }

  _write(chunk, enc, cb) {
    console.log(chalk.black.bgYellow('Sink._write - sink buffer length', this._writableState.getBuffer().length))
    setTimeout(() => {
      console.log(chalk.inverse('Sink._write cb'))
      cb()
    }, WRITE_INTERVAL)
  }
}

const source = new Source({
  encoding: 'utf8',
  highWaterMark: 100

})
source.setEncoding('utf8')
source.on('end', () => {
  console.log(chalk.black.bgRed('Source end'))
})
const sink = new Sink({
  decodeStrings: false,
  highWaterMark: 100
})
sink.setDefaultEncoding('utf8')
sink.on('drain', () => {
  console.log(chalk.black.bgGreen('Sink drain event'))
})
sink.on('finish', () => {
  console.log(chalk.black.bgRed('Sink finish'))
})

source.pipe(sink)



