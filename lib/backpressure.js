'use strict'

const stream = require('stream')
const chalk = require('chalk')

const READ_COUNT = 10 // the number of times Source._read can be called before it pushes null
const READ_INTERVAL = 100 // ms
const WRITE_INTERVAL = 1000 // ms
const SOURCE_HIGH_WATER_MARK = 100 // bytes
const SINK_HIGH_WATER_MARK = 100 // bytes
const BUFFER_POLL_INTERVAL = 1
const CHUNK_DATA = 'abcdefghijklmnopqrstuvwxy'
const CHUNK_BYTES = CHUNK_DATA.length

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

  Source.push and Sink.write is synchronous

  Source.end is not fired until the source has read all the data, and the source buffer is emptied

  Seems like the sink buffer uses some of its capacity for the current element being written, even though it isn't
  reported in the buffer length

*/

function printBuffer(bufferCapacity, bufferLength, prefix) {
  console.log(`${prefix} buffer`)
  printBufferBorder(bufferCapacity)
  const bufferContentsArray = Array(Math.floor(bufferCapacity) * 3).fill(' ', 0)
  bufferContentsArray.unshift('|')
  bufferContentsArray.push('|')
  bufferContentsArray.fill('/', 1, bufferLength * 3 + 1)
  console.log(chalk.green(bufferContentsArray.join('')))
  printBufferBorder(bufferCapacity)
}

function printBufferBorder(bufferCapacity) {
  console.log(Array(bufferCapacity * 3 + 2).fill('-', 0).join(''))
}

class Source extends stream.Readable {
  constructor(options) {
    super(options)
    this.count = 0
    this.pushCount = 0
    this.bufferLength = 0
    this.bufferCapacity = SINK_HIGH_WATER_MARK / CHUNK_BYTES
    this.bufferInterval = setInterval(() => {
      if (this.getBufferLength() !== this.bufferLength) {
        printBuffer(this.bufferCapacity, this.getBufferLength(), 'Source')
        /*
        console.log(chalk.white(`Source interval buffer length changed: prev - ${this.bufferLength} ` +
          `curr - ${this.getBufferLength()}`))
        console.log(chalk.white(`max buffer length = ${SOURCE_HIGH_WATER_MARK / 25}`))
        */
        this.bufferLength = this.getBufferLength()

      }
    }, BUFFER_POLL_INTERVAL)
  }



  getBufferLength() {
    return this._readableState.buffer.length
  }

  _read(size) {
    this.count++
    console.log(chalk.white.bgBlue(`Source._read #${this.count} starting`))
    setTimeout(() => {
      // chunk is 25 chars, 50 bytes in memory but only 25 bytes when transmitted as a buffer?
      let data = this.count > READ_COUNT ? null : CHUNK_DATA
      //this.pushCount++
      //console.log(chalk.black.bgCyan(`About to call Source._push #${this.pushCount}`))
      const writeResponse = this.push(data)
      //console.log(chalk.black.bgCyan(`Source._push #${this.pushCount} response: ${writeResponse}`))
      if (writeResponse === false) {
        if (data !== null) {
          setImmediate(() => {
            console.log(chalk.black.bgRed('Sink and source buffers are full, reading paused'))
          })
        } else {
          console.log('Source pushed null')
        }
      }
    }, READ_INTERVAL)
  }
}

class Sink extends stream.Writable {
  constructor(options) {
    super(options)
    this.writeId = 0
    this.completeId = 0
    this.bufferCapacity = (SINK_HIGH_WATER_MARK - CHUNK_BYTES) / CHUNK_BYTES
    this.bufferLength = 0
    this.bufferInterval = setInterval(() => {
      if (this.getBufferLength() !== this.bufferLength) {
        printBuffer(this.bufferCapacity, this.getBufferLength(), 'Sink')
        /*
        console.log(chalk.white(`Sink interval buffer length changed: prev - ${this.bufferLength} ` +
          `curr - ${this.getBufferLength()}`))
        */
        this.bufferLength = this.getBufferLength()
      }
    }, BUFFER_POLL_INTERVAL)
  }

  getBufferLength() {
    return this._writableState.getBuffer().length
  }

  _write(chunk, enc, cb) {
    this.writeId++
    console.log(chalk.black.bgYellow(`Sink._write #${this.writeId} started`))
    setTimeout(() => {
      //this.completeId++
      //console.log(chalk.inverse(`Sink._write #${this.completeId} completed`))
      cb()
    }, WRITE_INTERVAL)
  }
}

const source = new Source({
  encoding: 'utf8',
  highWaterMark: SOURCE_HIGH_WATER_MARK

})
source.setEncoding('utf8')
source.on('end', () => {
  console.log(chalk.black.bgRed('Source end'))
})
const sink = new Sink({
  decodeStrings: false,
  highWaterMark: SINK_HIGH_WATER_MARK
})
sink.setDefaultEncoding('utf8')
sink.on('drain', () => {
  console.log(chalk.black.bgGreen('Sink drain event'))
})
sink.on('finish', () => {
  console.log(chalk.black.bgRed('Sink finish'))
  clearInterval(sink.bufferInterval)
  clearInterval(source.bufferInterval)
})

source.pipe(sink)
