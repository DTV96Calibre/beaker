import * as yo from 'yo-yo'
import {Archive} from 'builtin-pages-lib'

// state
var archive
var isDownloading = false

// form variables
var title = ''
var description = ''

// exported api
// =

window.setup = async function (opts) {
  if (!opts.url) {
    // ditch out
    return beakerBrowser.closeModal({
      name: 'Error',
      message: '{url} is required'
    })
  }

  try {
    // fetch archive info
    archive = new Archive(opts.url)
    await archive.setup('/')

    // listen to archive download progress
    await archive.startMonitoringDownloadProgress()
    archive.progress.addEventListener('changed', render)
  } catch (e) {
    // ditch out
    return beakerBrowser.closeModal({
      name: e.name,
      message: e.message || e.toString()
    })
  }

  // render
  title = opts.title || ''
  description = opts.description || ''
  render()
}

// event handlers
// =

window.addEventListener('keyup', e => {
  if (e.which === 27) {
    beakerBrowser.closeModal()
  }
})

function onChangeTitle (e) {
  title = e.target.value
}

function onChangeDescription (e) {
  description = e.target.value
}

function onClickCancel (e) {
  e.preventDefault()
  beakerBrowser.closeModal()
}

function onClickDownload (e) {
  e.preventDefault()
  archive.download()
  isDownloading = true
  render()
}

async function onSubmit (e) {
  e.preventDefault()
  try {
    var newArchive = await DatArchive.fork(archive.info.key, { title, description })
    beakerBrowser.closeModal(null, {url: newArchive.url})
  } catch (e) {
    beakerBrowser.closeModal({
      name: e.name,
      message: e.message || e.toString()
    })
  }
}

// internal methods
// =

function render () {
  var isComplete = archive.info.isOwner || archive.progress.isComplete
  var progressEl, downloadBtn
  if (!isComplete) {
    // status/progress of download
    progressEl = yo`<div class="fork-dat-progress">
      ${archive.progress.current > 0
        ? yo`<progress value=${archive.progress.current} max="100"></progress>`
        : ''}
      Some files have not been downloaded, and will be missing from your fork.
    </div>`
    if (!isComplete) {
      downloadBtn = yo`<button type="button" class="btn ${isDownloading ? 'disabled' : 'success'}" onclick=${onClickDownload}>
        ${ isDownloading ? '' : 'Finish'} Downloading Files
      </button>`
    }
  } else {
    progressEl = yo`<div class="fork-dat-progress">Ready to fork.</div>`
  }
  yo.update(document.querySelector('main'), yo`<main>
    <div class="modal">
      <div class="modal-inner">
        <div class="fork-dat-modal">
          <h2 class="title">Fork ${renderArchiveTitle()}</h2>
          <p class="help-text">
            Create a copy of this site and save it to your library
          </p>

          <form onsubmit=${onSubmit}>
            <label for="title">Title</label>
            <input name="title" tabindex="1" value=${title} placeholder="New Name" onchange=${onChangeTitle} />

            <label for="desc">Description</label>
            <input name="desc" tabindex="2" value=${description} placeholder="New Description" onchange=${onChangeDescription} />

            ${progressEl}
            <div class="form-actions">
              <button type="button" class="btn" onclick=${onClickCancel}>Cancel</button>
              <button type="submit" class="btn ${isComplete ? 'success' : ''}" tabindex="3">
                Create fork ${!isComplete ? ' anyway' : ''}
              </button>
              ${downloadBtn}
            </div>
          </form>
        </div>
      </div>
    </div>
  </main>`)
}

function renderArchiveTitle() {
  var t = archive.info.title ? `"${archive.info.title}"` : 'site'
  if (t.length > 100) {
    t = t.slice(0, 96) + '..."'
  }
  return t
}