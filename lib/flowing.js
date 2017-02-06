'use strict'

const stream = require('stream')
const chalk = require('chalk')

const READ_COUNT = 20 // the number of times Source._read can be called before it pushes null
const READ_INTERVAL = 100 // ms
const WRITE_INTERVAL = 1000 // ms
const SOURCE_HIGH_WATER_MARK = 100 // bytes
const SINK_HIGH_WATER_MARK = 100 // bytes
const BUFFER_POLL_INTERVAL = 10 // ms
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

  Source.readable and source._readableState.flowing seem to be dictated by the sink buffer. When it is full the source
  claims to be paused and not flowing. It keeps reading, which I suppose is expected? The idea is that flowing means
  no data is being pushed into the sink buffer, but that the source buffer can still be populated. The weird thing
  is that after the sink drains, the paused/flowing state is not updated.

*/

function monitorPaused(readable) {
  return setInterval(() => {
    const isPaused = readable.isPaused()
    if (readable.paused !== isPaused) {
      if (isPaused) {
        console.log(chalk.bold.white.bgRed('Source paused'))
      } else {
        console.log(chalk.black.bgGreen('Source unpaused'))
      }
      readable.paused = isPaused
    }
  }, BUFFER_POLL_INTERVAL)
}

function monitorFlowing(readable) {
  return setInterval(() => {
    const isFlowing = readable._readableState.flowing
    if (readable.flowing !== isFlowing) {
      if (isFlowing) {
        console.log(chalk.black.bgGreen('Source flowing'))
      } else {
        console.log(chalk.bold.white.bgRed('Source is not flowing'))
      }
      readable.flowing = isFlowing
    }
  }, BUFFER_POLL_INTERVAL)
}

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
      /*
      console.log('source is paused?', source.isPaused())
      console.log('source readable state', source._readableState.flowing)
      */
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
  console.log()
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
    this.flowing = false
    this.paused = true
    this.count = 0
    this.pushCount = 0
    this.bufferLength = 0
    this.bufferCapacity = SOURCE_HIGH_WATER_MARK / CHUNK_BYTES
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
      this.pushCount++
      console.log(chalk.black.bgCyan(`About to call Source._push #${this.pushCount}`))
      const writeResponse = this.push(data)
      console.log(chalk.black.bgCyan(`Source._push #${this.pushCount} response: ${writeResponse}`))
      if (writeResponse === false) {
        if (data !== null) {
          setTimeout(() => {
            console.log(chalk.bold.white.bgRed('Sink and source buffers are full'))
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
  console.log(chalk.bold.white.bgRed('Source end'))
})

const pausedInterval = monitorPaused(source)
const flowingInterval = monitorFlowing(source)

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
  clearInterval(pausedInterval)
  clearInterval(flowingInterval)
})



source.pipe(sink)
