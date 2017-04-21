'use strict'

const stream = require('stream')
const chalk = require('chalk')

const READ_COUNT = 10 // the number of times Source._read can be called before it pushes null
const READ_INTERVAL = 100 // ms
const WRITE_INTERVAL = 250 // ms
const SOURCE_HIGH_WATER_MARK = 100 // bytes
const SINK_HIGH_WATER_MARK = 100 // bytes
const BUFFER_POLL_INTERVAL = 10 // ms
const CHUNK_DATA = 'abcdefghijklmnopqrstuvwxy'
const CHUNK_BYTES = CHUNK_DATA.length

/*

  sink is a writable stream
  source is a readable stream
  source is piped into sink.

  This is a visual representation of the internal buffers of a read and write stream during a `.pipe` operation.
  There are a few interesting moments to observe:
  1. Nothing backs up in the read buffer until the write buffer is full. Chunks are passed directly to the write buffer.
  2. Once the write buffer fills up, it stops accepting new chunks until it empties completely, and emits a 'drain' event.
  3. Once the read buffer fills completely, read operations pause. This is signaled by `this.push` in the read stream returning false.
  4. Once the write buffer empties and the 'drain' event is emitted, as much of the read buffer as possible is transferred to the write buffer.


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

let source
let sink

/*
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
*/

function printNewline() {
  process.stdout.write('\n')
}

function printGap(gapLength) {
  process.stdout.write(Array(gapLength).fill(' ').join(''))
}

function printBuffers(source, sink) {
  const GAP_LENGTH = 20
  // bufferCapacity, bufferLength, prefix
  printNewline()
  console.log(`Source Buffer (${source.getBufferLength()})                    Sink Buffer (${sink.getBufferLength()})                    Completed chunks`)
  printBufferBorder(source.bufferCapacity)
  printGap(GAP_LENGTH)
  printBufferBorder(sink.bufferCapacity)
  printNewline()
  printBufferContents(source)
  printGap(GAP_LENGTH)
  printBufferContents(sink)
  printGap(GAP_LENGTH)
  process.stdout.write(chalk.green(`          ${sink.completeId}`))
  printNewline()
  printBufferBorder(source.bufferCapacity)
  printGap(GAP_LENGTH)
  printBufferBorder(sink.bufferCapacity)
  printNewline()
  printNewline()
}

function printBufferContents(stream) {
  const bufferContentsArray = Array(Math.floor(stream.bufferCapacity) * 3).fill(' ', 0)
  process.stdout.write('|')
  if (stream.getBufferLength()) {
    bufferContentsArray.fill('/', 0, stream.getBufferLength() * 3)
  }
  process.stdout.write(chalk.green(bufferContentsArray.join('')))
  process.stdout.write('|')
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
    this.bufferCapacity = SOURCE_HIGH_WATER_MARK / CHUNK_BYTES
  }



  getBufferLength() {
    return this._readableState.buffer.length
  }

  _read(size) {
    this.count++
    //console.log(chalk.white.bgBlue(`Source._read #${this.count} starting`))
    setTimeout(() => {
      // chunk is 25 chars, 50 bytes in memory but only 25 bytes when transmitted as a buffer?
      let data = this.count > READ_COUNT ? null : CHUNK_DATA
      this.pushCount++
      // console.log(chalk.black.bgCyan(`About to call Source._push #${this.pushCount}`))
      const writeResponse = this.push(data)
      printBuffers(this, sink)
      console.log(chalk.black.bgCyan(`Source._push #${this.pushCount} response: ${writeResponse}`))
      if (writeResponse === false) {
        if (data !== null) {
          setTimeout(() => {
            console.log(chalk.bold.white.bgRed('Source buffer full, reading paused'))
          }, 10)
        } else {
          console.log(chalk.bold.white.bgRed('Source pushed null, no more data coming from readstream'))
        }
      }
    }, READ_INTERVAL)
  }
}

source = new Source({
  encoding: 'utf8',
  highWaterMark: SOURCE_HIGH_WATER_MARK

})
source.setEncoding('utf8')
source.on('end', () => {
  console.log(chalk.bold.white.bgRed('Source end'))
})

class Sink extends stream.Writable {
  constructor(options) {
    super(options)
    this.writeId = 0
    this.completeId = 0
    this.bufferCapacity = SINK_HIGH_WATER_MARK / CHUNK_BYTES
    this.bufferLength = 0
    this.isWriting = false
  }

  getBufferLength() {
    const bufferLength = this._writableState.getBuffer().length
    const writingBuffer = this.isWriting ? 1 : 0
    return bufferLength + writingBuffer
  }

  _write(chunk, enc, cb) {
    this.isWriting = true
    this.writeId++
    //console.log(chalk.black.bgYellow(`Sink._write #${this.writeId} started`))
    setTimeout(() => {
      this.completeId++
      //console.log(chalk.inverse(`Sink._write #${this.completeId} completed`))
      this.isWriting = false
      printBuffers(source, this)
      cb()
    }, WRITE_INTERVAL)
  }
}

sink = new Sink({
  decodeStrings: false,
  highWaterMark: SINK_HIGH_WATER_MARK
})


sink.setDefaultEncoding('utf8')

sink.on('drain', () => {
  console.log(chalk.black.bgGreen('Sink drain event'))
})

sink.on('finish', () => {
  console.log(chalk.bold.white.bgRed('Sink finish'))
})



source.pipe(sink)
