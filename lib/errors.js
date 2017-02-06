'use strict'

const stream = require('stream')
const chalk = require('chalk')

const READ_COUNT = 10 // the number of times Source._read can be called before it pushes null
const READ_INTERVAL = 100 // ms
const WRITE_INTERVAL = 1000 // ms
const SOURCE_HIGH_WATER_MARK = 100 // bytes
const SINK_HIGH_WATER_MARK = 100 // bytes
const BUFFER_POLL_INTERVAL = 10 // ms
const CHUNK_DATA = 'abcdefghijklmnopqrstuvwxy'
const CHUNK_BYTES = CHUNK_DATA.length

/*
  Emitting an error in a stream doesn't impact anything downstream.

  Emitting an error in a stream will cause the stream directly upstream to `unpipe` the emitting stream.
  This will prevent any further chunks from being piped into the emitting stream. The emitting stream will
  finish any chunks in its buffer, and the upstream pipe will hang (unless it has other streams to .pipe into).
*/

function bufferChanged(stream) {
  const changed = stream.getBufferLength() !== stream.bufferLength
  if (changed) {
    stream.bufferLength = stream.getBufferLength()
  }
  return changed
}

function monitorBuffers(source, sink) {
  return setInterval(() => {
    if (bufferChanged(sink) || bufferChanged(source)) {
      printBuffers(source, sink)
    }
  }, BUFFER_POLL_INTERVAL)
}

function printNewline() {
  process.stdout.write('\n')
}

function printGap(gapLength) {
  process.stdout.write(Array(gapLength).fill(' ').join(''))
}

function printBuffers(source, sink) {
  const GAP_LENGTH = 20
  // bufferCapacity, bufferLength, prefix
  console.log('Source Buffer                     Sink Buffer')
  printBufferBorder(source.bufferCapacity)
  printGap(GAP_LENGTH)
  printBufferBorder(sink.bufferCapacity)
  printNewline()
  printBufferContents(source)
  printGap(GAP_LENGTH)
  printBufferContents(sink)
  printNewline()
  printBufferBorder(source.bufferCapacity)
  printGap(GAP_LENGTH)
  printBufferBorder(sink.bufferCapacity)
  printNewline()
}

function printBufferContents(stream) {
  const bufferContentsArray = Array(Math.floor(stream.bufferCapacity) * 3).fill(' ', 0)
  bufferContentsArray.unshift('|')
  bufferContentsArray.push('|')
  bufferContentsArray.fill('/', 1, stream.bufferLength * 3 + 1)
  process.stdout.write(chalk.green(bufferContentsArray.join('')))
}

function printBufferBorder(bufferCapacity) {
  process.stdout.write(Array(bufferCapacity * 3 + 2).fill('-', 0).join(''))
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
        //printBuffer(this.bufferCapacity, this.getBufferLength(), 'Source')
        /*
        console.log(chalk.white(`Source interval buffer length changed: prev - ${this.bufferLength} ` +
          `curr - ${this.getBufferLength()}`))
        console.log(chalk.white(`max buffer length = ${SOURCE_HIGH_WATER_MARK / 25}`))
        this.bufferLength = this.getBufferLength()
        */

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
      if (this.count === 3) {
        this.emit('error', new Error('Test source error'))
      }
      //this.pushCount++
      //console.log(chalk.black.bgCyan(`About to call Source._push #${this.pushCount}`))
      const writeResponse = this.push(data)
      //console.log(chalk.black.bgCyan(`Source._push #${this.pushCount} response: ${writeResponse}`))
      if (writeResponse === false) {
        if (data !== null) {
          setTimeout(() => {
            console.log(chalk.bold.white.bgRed('Sink and source buffers are full, reading paused'))
          }, 10)
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
        //printBuffer(this.bufferCapacity, this.getBufferLength(), 'Sink')
        /*
        console.log(chalk.white(`Sink interval buffer length changed: prev - ${this.bufferLength} ` +
          `curr - ${this.getBufferLength()}`))
        this.bufferLength = this.getBufferLength()
        */
      }
    }, BUFFER_POLL_INTERVAL)
  }

  getBufferLength() {
    return this._writableState.getBuffer().length
  }

  _write(chunk, enc, cb) {
    this.writeId++
    console.log(chalk.black.bgYellow(`Sink._write #${this.writeId} started`))
    if (this.writeId == 7) {
      this.emit('error', new Error('Test sink error'))
    }
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
  console.log(chalk.bold.white.bgRed('Source end'))
})
source.on('error', (err) => {
  console.error(chalk.bold.white.bgRed('Source error'))
})

source.on('unpipe', () => {
  console.log(chalk.bold.white.bgRed(`Source unpiped by ${src.constructor.name}`))
})

const sink = new Sink({
  decodeStrings: false,
  highWaterMark: SINK_HIGH_WATER_MARK
})

const bufferInterval = monitorBuffers(source, sink)

sink.setDefaultEncoding('utf8')

sink.on('drain', () => {
  console.log(chalk.black.bgGreen('Sink drain event'))
})

sink.on('finish', () => {
  console.log(chalk.bold.white.bgRed('Sink finish'))
  clearInterval(sink.bufferInterval)
  clearInterval(source.bufferInterval)
  clearInterval(bufferInterval)
})

sink.on('error', () => {
  console.error(chalk.bold.white.bgRed('Sink error'))
})

sink.on('unpipe', (src) => {
  console.log(chalk.bold.white.bgRed(`Sink unpiped by ${src.constructor.name}`))
})

source.pipe(sink)
