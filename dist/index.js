/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 518:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const semver = __nccwpck_require__(816)

const requireScript = __nccwpck_require__(834)

/**
 * Bumps the given version with the given release type
 *
 * @param releaseType
 * @param version
 * @returns {string}
 */
module.exports = async (releaseType, version) => {
  let newVersion

  const prerelease = core.getBooleanInput('pre-release')
  const identifier = core.getInput('pre-release-identifier')

  if (version) {
    newVersion = semver.inc(version, (prerelease ? `pre${releaseType}` : releaseType), identifier)
  } else {

    const fallbackVersion = core.getInput('fallback-version')

    if (fallbackVersion) {
      newVersion = semver.valid(fallbackVersion)
    }

    if (!newVersion) {
      // default
      newVersion = (prerelease ? `0.1.0-${identifier}.0` : '0.1.0')
    }

    core.info(`The version could not be detected, using fallback version '${newVersion}'.`)
  }

  const preChangelogGenerationFile = core.getInput('pre-changelog-generation')

  if (preChangelogGenerationFile) {
    const preChangelogGenerationScript = requireScript(preChangelogGenerationFile)

    // Double check if we want to update / do something with the version
    if (preChangelogGenerationScript && preChangelogGenerationScript.preVersionGeneration) {
      const modifiedVersion = await preChangelogGenerationScript.preVersionGeneration(newVersion)

      if (modifiedVersion) {
        core.info(`Using modified version "${modifiedVersion}"`)
        newVersion = modifiedVersion
      }
    }
  }

  return newVersion
}


/***/ }),

/***/ 597:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const fs = __nccwpck_require__(896)
const { Readable } = __nccwpck_require__(203)
const conventionalChangelog = __nccwpck_require__(359)
const { loadPreset } = __nccwpck_require__(694)

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
 * @returns {*}
 */
const getChangelogStream = async(tagPrefix, preset, version, releaseCount, config, gitPath, skipUnstable) => conventionalChangelog({
    preset: await loadPreset(preset),
    releaseCount: parseInt(releaseCount, 10),
    tagPrefix,
    config,
    skipUnstable
  },
  {
    version,
    currentTag: `${tagPrefix}${version}`
  },
  {
    path: gitPath === '' || gitPath === null ? undefined : gitPath
  },
  config && config.parserOpts,
  config && config.writerOpts
)

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
module.exports.generateStringChangelog = (tagPrefix, preset, version, releaseCount, config, gitPath, skipUnstable) => new Promise(async(resolve) => {
  const changelogStream = await getChangelogStream(tagPrefix, preset, version, releaseCount, config, gitPath, skipUnstable)

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
module.exports.generateFileChangelog = (tagPrefix, preset, version, fileName, releaseCount, config, gitPath, infile) => new Promise(async(resolve) => {
  const changelogStream = await getChangelogStream(tagPrefix, preset, version, infile ? 1
    : releaseCount, config, gitPath)

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


/***/ }),

/***/ 830:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const exec = __nccwpck_require__(960)
const assert = __nccwpck_require__(613)

const { GITHUB_REPOSITORY, ENV } = process.env

module.exports = new (class Git {

  commandsRun = []

  constructor() {
    const githubToken = core.getInput('github-token')

    // Make the Github token secret
    if(githubToken) {
      core.setSecret(githubToken)
    }


    // if the env is dont-use-git then we mock exec as we are testing a workflow
    if (ENV === 'dont-use-git') {
      this.exec = (command) => {
        const fullCommand = `git ${command}`

        console.log(`Skipping "${fullCommand}" because of test env`)

        if (!fullCommand.includes('git remote set-url origin')) {
          this.commandsRun.push(fullCommand)
        }
      }
    }
  }

  init = async () => {
    const gitUserName = core.getInput('git-user-name')
    const gitUserEmail = core.getInput('git-user-email')
    const gitUrl = core.getInput('git-url')
    const githubToken = core.getInput('github-token')

    // Set config
    await this.config('user.name', gitUserName)
    await this.config('user.email', gitUserEmail)

    // Update the origin
    if (githubToken) {
      await this.updateOrigin(`https://x-access-token:${githubToken}@${gitUrl}/${GITHUB_REPOSITORY}.git`)
    }
  }

  /**
   * Executes the git command
   *
   * @param command
   * @return {Promise<>}
   */
  exec = (command) => new Promise(async (resolve, reject) => {
    let execOutput = ''

    const options = {
      listeners: {
        stdout: (data) => {
          execOutput += data.toString()
        },
      },
    }

    const exitCode = await exec.exec(`git ${command}`, null, options)

    if (exitCode === 0) {
      resolve(execOutput)

    } else {
      reject(`Command "git ${command}" exited with code ${exitCode}.`)
    }
  })

  /**
   * Set a git config prop
   *
   * @param prop
   * @param value
   * @return {Promise<>}
   */
  config = (prop, value) => this.exec(`config ${prop} "${value}"`)

  /**
   * Add a file to commit
   *
   * @param file
   * @returns {*}
   */
  add = (file) => this.exec(`add ${file}`)

  /**
   * Commit all changes
   *
   * @param message
   *
   * @return {Promise<>}
   */
  commit = (message, options = {}) => {
    const {noVerify} = options
    const args = [`commit -m "${message}"`]
    if (noVerify) {
      args.push("--no-verify")
    }
    return this.exec(args.join(" "))
  }

  /**
   * Pull the full history
   *
   * @return {Promise<>}
   */
  pull = async () => {
    const args = ['pull']

    // Check if the repo is unshallow
    if (await this.isShallow()) {
      args.push('--unshallow')
    }

    args.push('--tags')
    args.push(core.getInput('git-pull-method'))

    return this.exec(args.join(' '))
  }

  /**
   * Push all changes
   *
   * @return {Promise<>}
   */
  push = (branch) => (
    this.exec(`push origin ${branch} --follow-tags`)
  )

  /**
   * Check if the repo is shallow
   *
   * @return {Promise<>}
   */
  isShallow = async () => {
    if (ENV === 'dont-use-git') {
      return false
    }

    const isShallow = await this.exec('rev-parse --is-shallow-repository')

    return isShallow.trim().replace('\n', '') === 'true'
  }

  /**
   * Updates the origin remote
   *
   * @param repo
   * @return {Promise<>}
   */
  updateOrigin = (repo) => this.exec(`remote set-url origin ${repo}`)

  /**
   * Creates git tag
   *
   * @param tag
   * @return {Promise<>}
   */
  createTag = (tag) => this.exec(`tag -a ${tag} -m "${tag}"`)

  /**
   * Validates the commands run
   */
  testHistory = (branch) => {
    if (ENV === 'dont-use-git') {
      const { EXPECTED_TAG, SKIPPED_COMMIT, EXPECTED_NO_PUSH, SKIPPED_TAG, SKIPPED_PULL, SKIP_CI } = process.env

      const expectedCommands = [
        'git config user.name "Conventional Changelog Action"',
        'git config user.email "conventional.changelog.action@github.com"',
      ]

      if (!SKIPPED_PULL) {
        expectedCommands.push('git pull --tags --ff-only')
      }

      if (!SKIPPED_COMMIT) {
        expectedCommands.push('git add .')
        if (SKIP_CI === 'false') {
          expectedCommands.push(`git commit -m "chore(release): ${EXPECTED_TAG}"`)

        } else {
          expectedCommands.push(`git commit -m "chore(release): ${EXPECTED_TAG} [skip ci]"`)
        }
      }

      if(!SKIPPED_TAG) {
        expectedCommands.push(`git tag -a ${EXPECTED_TAG} -m "${EXPECTED_TAG}"`)
      } 

      if (!EXPECTED_NO_PUSH) {
        expectedCommands.push(`git push origin ${branch} --follow-tags`)
      }

      assert.deepStrictEqual(
        this.commandsRun,
        expectedCommands,
      )
    }
  }

})()


/***/ }),

/***/ 694:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

/**
 * Skips loading of the "angular" preset as that one is compiled with this action
 */
module.exports.loadPreset = async(preset) => {
  switch (preset) {
    case 'angular':
    case 'conventionalcommits':
    case 'eslint':
      return null

    default:
      return preset
  }
}

/**
 * Loads the "angular" preset, so it works with ncc compiled dist, if user provided own config
 * that one will be used instead
 */
module.exports.loadPresetConfig = async(preset, providedConfig = {}) => {
  if (providedConfig && typeof providedConfig === 'object') {
    return providedConfig
  }

  switch (preset) {
    case 'angular':
      return await __nccwpck_require__(506)()

    case 'conventionalcommits':
      return await __nccwpck_require__(308)()

    case 'eslint':
      return await __nccwpck_require__(843)()

    default:
      return {}
  }
}


/***/ }),

/***/ 834:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const path = __nccwpck_require__(928)
const fs = __nccwpck_require__(896)

/**
 * Requires an script
 *
 * @param file
 */
module.exports = (file) => {
  const fileLocation = path.resolve(process.cwd(), file)

  // Double check the script exists before loading it
  if (fs.existsSync(fileLocation)) {
    core.info(`Loading "${fileLocation}" script`)

    return require(fileLocation)
  }

  core.error(`Tried to load "${fileLocation}" script but it does not exists!`)

  return undefined
}


/***/ }),

/***/ 862:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const fs = __nccwpck_require__(896)

module.exports = class BaseVersioning {

  fileLocation = null

  versionPath = null

  newVersion = null

  oldVersion = null

  /**
   * Set some basic configurations
   *
   * @param {!string} fileLocation - Full location of the file
   * @param {!string} versionPath - Path inside the file where the version is located
   */
  init = (fileLocation, versionPath) => {
    this.fileLocation = fileLocation
    this.versionPath = versionPath
    this.parseFile()
  }

  /**
   * Abstract method for parsing the file
   */
  parseFile = () => {
    throw new Error('Implement parseFile logic in class!')
  }

  /**
   * Get the file's content
   *
   * @return {string}
   */
  readFile = () => {
    if (fs.existsSync(this.fileLocation)) {
      return fs.readFileSync(this.fileLocation, 'utf8')
    }

    core.warning(`Tried to read "${this.fileLocation}" but file does not exist!`)

    return ''
  }

  /**
   * Logic for bumping the version
   *
   * @param {!string} releaseType - The type of release
   * @return {*}
   */
  bump = (releaseType) => {
    throw new Error('Implement bump logic in class!')
  }

  /**
   * Update the file
   *
   * @param {!string} newContent - New content for the file
   * @return {*}
   */
  update = (newContent) => (
    fs.writeFileSync(this.fileLocation, newContent)
  )

}



/***/ }),

/***/ 231:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const gitSemverTags = __nccwpck_require__(77)

const BaseVersioning = __nccwpck_require__(862)
const bumpVersion = __nccwpck_require__(518)

module.exports = class Git extends BaseVersioning {

  /**
   * Left empty to override the parent's abstract method, which would throw an error
   */
  parseFile = () => {

  }

  bump = async(releaseType) => {
    const tagPrefix = core.getInput('tag-prefix')
    const prerelease = core.getBooleanInput('pre-release')

    const tags = await gitSemverTags({ tagPrefix, skipUnstable: !prerelease })
    this.oldVersion = tags.length > 0 ? tags.shift().replace(tagPrefix, '') : null

    // Get the new version
    this.newVersion = await bumpVersion(
      releaseType,
      this.oldVersion
    )
  }

}


/***/ }),

/***/ 755:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const Json = __nccwpck_require__(69)
const Git = __nccwpck_require__(231)
const Yaml = __nccwpck_require__(452)
const Toml = __nccwpck_require__(191)
const Mix = __nccwpck_require__(457)
const Properties = __nccwpck_require__(414)

module.exports = (fileExtension, filePath) => {
  switch (fileExtension.toLowerCase()) {
    case 'json':
      return new Json()

    case 'yaml':
    case 'yml':
      return new Yaml()

    case 'toml':
      return new Toml()

    case 'git':
      return new Git()

    case 'exs':
      return new Mix()

    case 'properties':
      return new Properties()

    default:
      throw new Error(`File extension "${fileExtension}" from file "${filePath}" is not supported`)
  }
}


/***/ }),

/***/ 69:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const objectPath = __nccwpck_require__(579)

const BaseVersioning = __nccwpck_require__(862)
const bumpVersion = __nccwpck_require__(518)

module.exports = class Json extends BaseVersioning {

  eol = null
  jsonContent = {}

  /**
   * Reads and parses the json file
   */
  parseFile = () => {
    // Read the file
    const fileContent = this.readFile()

    // Parse the file
    this.eol = fileContent.endsWith('\n') ? '\n' : ''
    try {
      this.jsonContent = JSON.parse(fileContent)
    } catch (error) {
      core.startGroup(`Error when parsing the file '${this.fileLocation}'`)
      core.info(`File-Content: ${fileContent}`)
      core.info(error) // should be 'warning' ?
      core.endGroup()
    }

    // Get the old version
    this.oldVersion = objectPath.get(this.jsonContent, this.versionPath, null)
  }

  /**
   * Bumps the version in the package.json
   *
   * @param {!string} releaseType - The type of release
   * @return {*}
   */
  bump = async (releaseType) => {
    // Get the new version
    this.newVersion = await bumpVersion(
      releaseType,
      this.oldVersion,
    )

    core.info(`Bumped file "${this.fileLocation}" from "${this.oldVersion}" to "${this.newVersion}"`)

    // Update the content with the new version
    objectPath.set(this.jsonContent, this.versionPath, this.newVersion)

    // Update the file
    this.update(
      JSON.stringify(this.jsonContent, null, 2) + this.eol
    )
  }

}



/***/ }),

/***/ 457:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const BaseVersioning = __nccwpck_require__(862)
const bumpVersion = __nccwpck_require__(518)

module.exports = class Mix extends BaseVersioning {

  fileContent = null

  /**
   * Reads and parses the mix file
   */
  parseFile = () => {
    // Read the file
    this.fileContent = this.readFile()

    // Parse the file
    const [_, oldVersion] = this.fileContent.match(/version: "([0-9.]+)"/i)
    this.oldVersion = oldVersion

    if (!this.oldVersion) {
      throw new Error(`Failed to extract mix project version.`)
    }
  }

  /**
   * Bumps the version in the package.json
   *
   * @param {!string} releaseType - The type of release
   * @return {*}
   */
  bump = async(releaseType) => {
    this.newVersion = await bumpVersion(
      releaseType,
      this.oldVersion
    )

    this.update(
      this.fileContent.replace(`version: "${this.oldVersion}"`, `version: "${this.newVersion}"`)
    )
  }
}


/***/ }),

/***/ 414:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const BaseVersioning = __nccwpck_require__(862)
const bumpVersion = __nccwpck_require__(518)
const core = __nccwpck_require__(781);
const properties = __nccwpck_require__(291)

module.exports = class Properties extends BaseVersioning {

  /**
   * @type {string | null}
   */
  fileContent = null

  /**
   * Reads and parses .properties file
   */
  parseFile = () => {
    this.fileContent = this.readFile()
    this.oldVersion = properties.parse(this.fileContent)[this.versionPath]
  }

  /**
   * Bumps the version in .properties file
   *
   * @param {!string} releaseType - The type of release
   * @return {*}
   */
  bump = async (releaseType) => {
    this.newVersion = await bumpVersion(
      releaseType,
      this.oldVersion,
    )

    // regex to capture key, separator and value in separate groups with whitespace
    // see: https://regexr.com/8gtpa
    const regex = new RegExp(`^(\\s*${this.versionPath}\\s*)(\\s*[:=]\\s*)(.*)$`, 'm')

    if (regex.test(this.fileContent)) {
      // replace existing version in file while preserving the separator and whitespaces
      this.update(
        this.fileContent.replace(
          regex,
          `$1$2${this.newVersion}`
        )
      )
    } else {
      // append new version to the end of the file and preserve previous newline character
      const eof = this.fileContent.endsWith('\n') ? '\n' : ''
      const newline = this.fileContent.length > 0 && !this.fileContent.endsWith('\n') ? '\n' : ''

      this.update(
        this.fileContent + newline + `${this.versionPath}=${this.newVersion}` + eof
      )
    }

    core.info(`Bumped file "${this.fileLocation}" from "${this.oldVersion}" to "${this.newVersion}"`)
  }

}


/***/ }),

/***/ 191:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const objectPath = __nccwpck_require__(579)
const toml = __nccwpck_require__(810)

const BaseVersioning = __nccwpck_require__(862)
const bumpVersion = __nccwpck_require__(518)

module.exports = class Toml extends BaseVersioning {

  tomlContent = null
  fileContent = null

  /**
   * Reads and parses the toml file
   */
  parseFile = () => {
    // Read the file
    this.fileContent = this.readFile()

    // Parse the file
    this.tomlContent = toml.parse(this.fileContent)
    this.oldVersion = objectPath.get(this.tomlContent, this.versionPath, null)
  }

  /**
   * Bumps the version in the package.json
   *
   * @param {!string} releaseType - The type of release
   * @return {*}
   */
  bump = async (releaseType) => {
    // Get the new version
    this.newVersion = await bumpVersion(
      releaseType,
      this.oldVersion,
    )

    // Update the file
    if (this.oldVersion) {
      // Get the name of where the version is in
      const versionName = this.versionPath.split('.').pop()

      core.info(`Bumped file "${this.fileLocation}" from "${this.oldVersion}" to "${this.newVersion}"`)

      this.update(
        // We use replace instead of yaml.stringify so we can preserve white spaces and comments
        this.fileContent.replace(
          `${versionName} = "${this.oldVersion}"`,
          `${versionName} = "${this.newVersion}"`,
        ),
      )
    } else {
      // Update the content with the new version
      objectPath.set(this.tomlContent, this.versionPath, this.newVersion)
      this.update(toml.stringify(this.tomlContent))
    }
  }

}



/***/ }),

/***/ 452:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(781)
const objectPath = __nccwpck_require__(579)
const yaml = __nccwpck_require__(625)

const BaseVersioning = __nccwpck_require__(862)
const bumpVersion = __nccwpck_require__(518)

module.exports = class Yaml extends BaseVersioning {

  fileContent = null
  yamlContent = null

  /**
   * Reads and parses the yaml file
   */
  parseFile = () => {
    // Read the file
    this.fileContent = this.readFile()
    
    // Parse the file
    this.yamlContent = yaml.parse(this.fileContent) || {}
    this.oldVersion = objectPath.get(this.yamlContent, this.versionPath, null)
  }

  /**
   * Bumps the version in the package.json
   *
   * @param {!string} releaseType - The type of release
   * @return {*}
   */
  bump = async (releaseType) => {
    // Get the new version
    this.newVersion = await bumpVersion(
      releaseType,
      this.oldVersion,
    )

    // Update the file
    if (this.oldVersion) {
      // Get the name of where the version is in
      const versionName = this.versionPath.split('.').pop()

      core.info(`Bumped file "${this.fileLocation}" from "${this.oldVersion}" to "${this.newVersion}"`)

      this.update(
        // We use replace instead of yaml.stringify so we can preserve white spaces and comments
        // Replace if version was used with single quotes
        this.fileContent.replace(
          `${versionName}: '${this.oldVersion}'`,
          `${versionName}: '${this.newVersion}'`,
        ).replace( // Replace if version was used with double quotes
          `${versionName}: "${this.oldVersion}"`,
          `${versionName}: "${this.newVersion}"`,
        ).replace( // Replace if version was used with no quotes
          `${versionName}: ${this.oldVersion}`,
          `${versionName}: ${this.newVersion}`,
        ),
      )
    } else {
      // Update the content with the new version
      objectPath.set(this.yamlContent, this.versionPath, this.newVersion)
      this.update(yaml.stringify(this.yamlContent))
    }
  }

}


/***/ }),

/***/ 781:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 960:
/***/ ((module) => {

module.exports = eval("require")("@actions/exec");


/***/ }),

/***/ 810:
/***/ ((module) => {

module.exports = eval("require")("@iarna/toml");


/***/ }),

/***/ 359:
/***/ ((module) => {

module.exports = eval("require")("conventional-changelog");


/***/ }),

/***/ 506:
/***/ ((module) => {

module.exports = eval("require")("conventional-changelog-angular");


/***/ }),

/***/ 308:
/***/ ((module) => {

module.exports = eval("require")("conventional-changelog-conventionalcommits");


/***/ }),

/***/ 843:
/***/ ((module) => {

module.exports = eval("require")("conventional-changelog-eslint");


/***/ }),

/***/ 337:
/***/ ((module) => {

module.exports = eval("require")("conventional-recommended-bump");


/***/ }),

/***/ 77:
/***/ ((module) => {

module.exports = eval("require")("git-semver-tags");


/***/ }),

/***/ 579:
/***/ ((module) => {

module.exports = eval("require")("object-path");


/***/ }),

/***/ 291:
/***/ ((module) => {

module.exports = eval("require")("properties");


/***/ }),

/***/ 816:
/***/ ((module) => {

module.exports = eval("require")("semver");


/***/ }),

/***/ 625:
/***/ ((module) => {

module.exports = eval("require")("yaml");


/***/ }),

/***/ 613:
/***/ ((module) => {

"use strict";
module.exports = require("assert");

/***/ }),

/***/ 896:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 203:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
const core = __nccwpck_require__(781)
const conventionalRecommendedBump = __nccwpck_require__(337)
const path = __nccwpck_require__(928)

const getVersioning = __nccwpck_require__(755)
const git = __nccwpck_require__(830)
const changelog = __nccwpck_require__(597)
const requireScript = __nccwpck_require__(834)
const { loadPreset, loadPresetConfig } = __nccwpck_require__(694)

async function handleVersioningByExtension(ext, file, versionPath, releaseType, skipBump) {
  const fileLocation = path.resolve(process.cwd(), file)
  const versioning = getVersioning(ext, fileLocation)

  versioning.init(fileLocation, versionPath)

  // Bump the version in the package.json
  if(skipBump){
    // If we are skipping the bump, we either use the old version or alternatively the fallback version
    const fallbackVersion = core.getInput('fallback-version')
    versioning.newVersion = versioning.oldVersion || fallbackVersion
  } else {
    await versioning.bump(releaseType)
  }

  return versioning
}

async function run() {
  try {
    let gitCommitMessage = core.getInput('git-message')
    const gitUserName = core.getInput('git-user-name')
    const gitUserEmail = core.getInput('git-user-email')
    const gitPush = core.getBooleanInput('git-push')
    const gitBranch = core.getInput('git-branch').replace('refs/heads/', '')
    const tagPrefix = core.getInput('tag-prefix')
    const preset = !core.getInput('config-file-path') ? core.getInput('preset') : ''
    const preCommitFile = core.getInput('pre-commit')
    const outputFile = core.getInput('output-file')
    const releaseCount = core.getInput('release-count')
    const versionFile = core.getInput('version-file')
    const versionPath = core.getInput('version-path')
    const skipGitPull = core.getBooleanInput('skip-git-pull')
    const skipVersionFile = core.getBooleanInput('skip-version-file')
    const skipCommit = core.getBooleanInput('skip-commit')
    const skipEmptyRelease = core.getBooleanInput('skip-on-empty')
    const skipTag = core.getBooleanInput('skip-tag')
    const conventionalConfigFile = core.getInput('config-file-path')
    const preChangelogGenerationFile = core.getInput('pre-changelog-generation')
    const gitUrl = core.getInput('git-url')
    const gitPath = core.getMultilineInput('git-path')
    const infile = core.getInput('input-file')
    const skipCi = core.getBooleanInput('skip-ci')
    const createSummary = core.getBooleanInput('create-summary')
    const prerelease = core.getBooleanInput('pre-release')
    const skipBump = core.getBooleanInput('skip-bump')
    const noVerify = core.getBooleanInput('no-verify')
    const workingDir = core.getInput('working-dir')

    if (skipCi) {
      gitCommitMessage += ' [skip ci]'
    }

    // Change working directory if specified
    if (workingDir) {
      core.info(`Changing working directory to "${workingDir}"`)
      process.chdir(workingDir)
    }

    core.info(`Using "${preset}" preset`)
    core.info(`Using "${gitCommitMessage}" as commit message`)
    core.info(`Using "${gitUserName}" as git user.name`)
    core.info(`Using "${gitUserEmail}" as git user.email`)
    core.info(`Using "${releaseCount}" release count`)
    core.info(`Using "${versionFile}" as version file`)
    core.info(`Using "${versionPath}" as version path`)
    core.info(`Using "${tagPrefix}" as tag prefix`)
    core.info(`Using "${outputFile}" as output file`)
    core.info(`Using "${conventionalConfigFile}" as config file`)
    core.info(`Using "${gitUrl}" as gitUrl`)
    core.info(`Using "${gitBranch}" as gitBranch`)
    core.info(`Using "${gitPath}" as gitPath`)
    core.info(`Using "${workingDir}" as working directory`)

    if (preCommitFile) {
      core.info(`Using "${preCommitFile}" as pre-commit script`)
    }

    if (infile) {
      core.info(`Using "${infile}" as input file`)
    }

    if (preChangelogGenerationFile) {
      core.info(`Using "${preChangelogGenerationFile}" as pre-changelog-generation script`)
    }

    if(skipBump) {
      core.info('Skipping bumping the version')
    }

    core.info(`Skipping empty releases is "${skipEmptyRelease ? 'enabled' : 'disabled'}"`)
    core.info(`Skipping the update of the version file is "${skipVersionFile ? 'enabled' : 'disabled'}"`)

    await git.init()

    if (!skipGitPull) {
      core.info('Pull to make sure we have the full git history')
      await git.pull()
    }

    const config = await loadPresetConfig(preset, conventionalConfigFile && requireScript(conventionalConfigFile))

    const recommendation = await conventionalRecommendedBump({
      preset: await loadPreset(preset),
      tagPrefix,
      config,
      skipUnstable: !prerelease,
      path: gitPath
    })

    core.info(`Recommended release type: ${recommendation.releaseType}`)

    // If we have a reason also log it
    if (recommendation.reason) {
      core.info(`Because: ${recommendation.reason}`)
    }

    let newVersion
    let oldVersion

    // If skipVersionFile or skipCommit is true we use GIT to determine the new version because
    // skipVersionFile can mean there is no version file and skipCommit can mean that the user
    // is only interested in tags
    if (skipVersionFile || skipCommit) {
      core.info('Using GIT to determine the new version')
      const versioning = await handleVersioningByExtension(
        'git',
        versionFile,
        versionPath,
        recommendation.releaseType,
        skipBump
      )

      oldVersion = versioning.oldVersion
      newVersion = versioning.newVersion
    } else {
      const files = versionFile.split(',').map((f) => f.trim())
      core.info(`Files to bump: ${files.join(', ')}`)

      const versioning = await Promise.all(
        files.map((file) => {
          const fileExtension = file.split('.').pop()
          core.info(`Bumping version to file "${file}" with extension "${fileExtension}"`)

          return handleVersioningByExtension(fileExtension, file, versionPath, recommendation.releaseType, skipBump)
        })
      )
      oldVersion = versioning[0].oldVersion
      newVersion = versioning[0].newVersion
    }

    let gitTag = `${tagPrefix}${newVersion}`

    if (preChangelogGenerationFile) {
      const preChangelogGenerationScript = requireScript(preChangelogGenerationFile)

      // Double check if we want to update / do something with the tag
      if (preChangelogGenerationScript && preChangelogGenerationScript.preTagGeneration) {
        const modifiedTag = await preChangelogGenerationScript.preTagGeneration(gitTag)

        if (modifiedTag) {
          core.info(`Using modified tag "${modifiedTag}"`)
          gitTag = modifiedTag
        }
      }
    }

    // Generate the string changelog
    const stringChangelog = await changelog.generateStringChangelog(tagPrefix, preset, newVersion, 1, config, gitPath, !prerelease)
    core.info('Changelog generated')
    core.info(stringChangelog)

    // Removes the version number from the changelog
    const cleanChangelog = stringChangelog.split('\n').slice(3).join('\n').trim()

    if (skipEmptyRelease && cleanChangelog === '') {
      core.info('Generated changelog is empty and skip-on-empty has been activated so we skip this step')
      core.setOutput('old_version', oldVersion)
      core.setOutput('version', oldVersion)
      core.setOutput('skipped', 'true')
      return
    }

    core.info(`New version: ${newVersion}`)

    // If output file === 'false' we don't write it to file
    if (outputFile !== 'false') {
      // Generate the changelog
      await changelog.generateFileChangelog(tagPrefix, preset, newVersion, outputFile, releaseCount, config, gitPath, infile)
    }

    if (!skipCommit) {
      // Add changed files to git
      if (preCommitFile) {
        const preCommitScript = requireScript(preCommitFile)

        // Double check if the file exists and the export exists
        if (preCommitScript && preCommitScript.preCommit) {
          await preCommitScript.preCommit({
            tag: gitTag,
            version: newVersion
          })
        }
      }

      await git.add('.')
      await git.commit(gitCommitMessage.replace('{version}', gitTag), {noVerify})
    }

    // Create the new tag
    if (!skipTag) {
      await git.createTag(gitTag)
    } else {
      core.info('We are not going to the tag the GIT changes')
    }

    if (gitPush) {
      try {
        core.info('Push all changes')
        await git.push(gitBranch)

      } catch (error) {
        console.error(error)

        core.setFailed(error)

        return
      }

    } else {
      core.info('We are not going to push the GIT changes')
    }

    // Set outputs so other actions (for example actions/create-release) can use it
    core.setOutput('changelog', stringChangelog)
    core.setOutput('clean_changelog', cleanChangelog)
    core.setOutput('version', newVersion)
    core.setOutput('old_version', oldVersion)
    core.setOutput('tag', gitTag)
    core.setOutput('skipped', 'false')

    if (createSummary) {
      try {
        await core.summary
          .addHeading(gitTag, 2)
          .addRaw(cleanChangelog)
          .write()
      } catch (err) {
        core.warning(`Was unable to create summary! Error: "${err}"`)
      }
    }

    try {
      // If we are running in test mode we use this to validate everything still runs
      git.testHistory(gitBranch)

    } catch (error) {
      console.error(error)

      core.setFailed(error)
    }
  } catch (error) {
    core.setFailed(error)
  }
}

process.on('unhandledRejection', (reason, promise) => {
  let error = `Unhandled Rejection occurred. ${reason.stack}`
  console.error(error)
  core.setFailed(error)
})

run()

module.exports = __webpack_exports__;
/******/ })()
;