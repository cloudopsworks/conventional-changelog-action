const core = require('@actions/core')
const gitSemverTags = require('git-semver-tags')

const BaseVersioning = require('./base')
const bumpVersion = require('../helpers/bumpVersion')

module.exports = class Git extends BaseVersioning {

  /**
   * Left empty to override the parent's abstract method, which would throw an error
   */
  parseFile = () => {

  }

  /**
   * Loads the current and previous version from git tags.
   * Used when skip-bump is true: the most recent tag is the current release (newVersion)
   * and the second most recent is the previous release (oldVersion for compare URL).
   */
  loadVersion = async() => {
    const tagPrefix = core.getInput('tag-prefix')
    const prerelease = core.getBooleanInput('pre-release')

    const tags = await gitSemverTags({ tagPrefix, skipUnstable: !prerelease })
    // tags[0] = current release (already tagged), tags[1] = previous release
    this.newVersion = tags.length > 0 ? tags[0].replace(tagPrefix, '') : null
    this.oldVersion = tags.length > 1 ? tags[1].replace(tagPrefix, '') : null
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
