const fs = require('fs')
const { Readable } = require('stream')
const conventionalChangelog = require('conventional-changelog')
const { loadPreset } = require('./load-preset')

/**
 * Generates a changelog stream with the given arguments
 *
 * @param tagPrefix
 * @param preset
 * @param version
 * @param releaseCount
 * @param config
 * @param gitPath
 * @param skipUnstable
 * @param previousTag - when set, indicates HEAD is already at the release tag; enables
 *                      correct changelog generation for already-tagged commits by working
 *                      around conventional-changelog suppressing output when lastTag===version
 * @returns {*}
 */
const getChangelogStream = async(tagPrefix, preset, version, releaseCount, config, gitPath, skipUnstable, previousTag) => {
  const currentTag = `${tagPrefix}${version}`
  const isAlreadyTagged = !!previousTag

  // When HEAD is already at the release tag, conventional-changelog-core detects
  // lastTag === version and sets outputUnreleased=false (doFlush=false), producing empty
  // output. Work around this by enabling outputUnreleased and fetching one extra release
  // block so the range covers previousTag..currentTag rather than currentTag..HEAD.
  const options = {
    preset: await loadPreset(preset),
    releaseCount: isAlreadyTagged ? parseInt(releaseCount, 10) + 1 : parseInt(releaseCount, 10),
    tagPrefix,
    config,
    skipUnstable,
    ...(isAlreadyTagged && { outputUnreleased: true }),
  }

  const context = {
    version,
    currentTag,
    ...(isAlreadyTagged && { previousTag }),
  }

  // Our finalizeContext replaces the core's default. We must restore the correct version
  // (core renames it to "Unreleased" when outputUnreleased=true) and ensure linkCompare
  // is set so the header link renders as [version](previousTag...currentTag).
  const writerOpts = Object.assign({}, config && config.writerOpts)
  if (isAlreadyTagged) {
    const origFinalizeContext = writerOpts.finalizeContext
    writerOpts.finalizeContext = (ctx, opts, filteredCommits, keyCommit, originalCommits) => {
      if (ctx.version === 'Unreleased') {
        ctx.version = version
        ctx.linkCompare = true
        ctx.previousTag = previousTag
        ctx.currentTag = currentTag
      }
      return origFinalizeContext
        ? origFinalizeContext(ctx, opts, filteredCommits, keyCommit, originalCommits)
        : ctx
    }
  }

  return conventionalChangelog(
    options,
    context,
    { path: gitPath === '' || gitPath === null ? undefined : gitPath },
    config && config.parserOpts,
    writerOpts,
  )
}

module.exports = getChangelogStream

/**
 * Generates a string changelog
 *
 * @param tagPrefix
 * @param preset
 * @param version
 * @param releaseCount
 * @param config
 * @param gitPath
 * @param skipUnstable
 * @returns {Promise<string>}
 */
module.exports.generateStringChangelog = (tagPrefix, preset, version, releaseCount, config, gitPath, skipUnstable, previousTag) => new Promise(async(resolve) => {
  const changelogStream = await getChangelogStream(tagPrefix, preset, version, releaseCount, config, gitPath, skipUnstable, previousTag)

  let changelog = ''

  changelogStream
    .on('data', (data) => {
      changelog += data.toString()
    })
    .on('end', () => resolve(changelog))
})

/**
 * Generates a file changelog
 *
 * @param tagPrefix
 * @param preset
 * @param version
 * @param fileName
 * @param releaseCount
 * @param config
 * @param gitPath
 * @param infile
 * @returns {Promise<>}
 */
module.exports.generateFileChangelog = (tagPrefix, preset, version, fileName, releaseCount, config, gitPath, infile, previousTag) => new Promise(async(resolve) => {
  const changelogStream = await getChangelogStream(tagPrefix, preset, version, infile ? 1
    : releaseCount, config, gitPath, undefined, previousTag)

  // The default changelog output to be streamed first
  const readStreams = [changelogStream]

  // If an input-file is provided and release count is not 0
  if (infile) {
    // The infile is read synchronously to avoid repeatedly reading newly written content while it is being written
    const buffer = fs.readFileSync(infile)
    const readableStream = Readable.from(buffer)
    // We add the stream as the next item for later pipe
    readStreams.push(readableStream)
  }

  const writeStream = fs.createWriteStream(fileName)

  let currentIndex = 0

  function pipeNextStream() {
    if (currentIndex < readStreams.length) {
      const currentStream = readStreams[currentIndex]

      currentStream.pipe(writeStream, { end: false })

      currentStream.once('end', () => {
        currentIndex++
        pipeNextStream()
      })
    } else {
      // All stream pipes have completed
      writeStream.end()
      resolve()
    }
  }

  pipeNextStream()

})
