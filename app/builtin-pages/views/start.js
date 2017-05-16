/*
This uses the beaker.bookmarks API, which is exposed by webview-preload to all
sites loaded over the beaker: protocol
*/

import * as yo from 'yo-yo'
import {ArchivesList} from 'builtin-pages-lib'
import ColorThief from '../../lib/fg/color-thief'
import {findParent} from '../../lib/fg/event-handlers'
import {pluralize} from '../../lib/strings'

const colorThief = new ColorThief()

const LATEST_VERSION = 7000 // semver where major*1mm and minor*1k; thus 3.2.1 = 3002001

// globals
// =

var showReleaseNotes = false
var isManagingBookmarks = false
var isShelfOpen = false
var error = false
var userProfile
var userSetupStatus
var archivesStatus
var bookmarks, pinnedBookmarks
var archivesList
var settings

setup()
async function setup () {
  await loadBookmarks()
  archivesStatus = await beaker.archives.status()
  userProfile = await beaker.profiles.get(0)
  try {
    userProfile.title = (await beaker.archives.get(userProfile.url, {timeout: 500})).title
  } catch (e) {
    userProfile.title = 'Your profile'
  }
  settings = await beakerBrowser.getSettings()
  userSetupStatus = await beakerBrowser.getUserSetupStatus()

  update()

  // subscribe to network changes
  beaker.archives.addEventListener('network-changed', ({details}) => {
    archivesStatus.peers = details.totalPeers
    yo.update(document.querySelector('a.network'), renderNetworkLink())
  })

  // render version update info if appropriate
  let latestVersion = await beakerSitedata.get('beaker://start', 'latest-version')
  if (+latestVersion < LATEST_VERSION) {
    showReleaseNotes = true
    update()
    beakerSitedata.set('beaker://start', 'latest-version', LATEST_VERSION)
  }

  // load archives list after render (its not pressing)
  archivesList = new ArchivesList({listenNetwork: true})
  await archivesList.setup({isSaved: true})
  console.log(archivesList.archives)
  archivesList.archives.sort((a, b) => {
    if (a.url === userProfile.url) return -1
    if (b.url === userProfile.url) return 1
    return niceName(a).localeCompare(niceName(b))
  })
}

// rendering
// =

function update () {
  var theme = settings.start_page_background_image

  yo.update(document.querySelector('main'), yo`
    <main class="${theme}">
      <header>
        <div class="actions">
          <a onclick=${createSite}><i class="fa fa-pencil"></i> New site</a>
        </div>
        <div style="flex: 1"></div>
        ${renderProfileCard()}
      </header>
      ${renderShelf()}
      ${renderWelcome()}
      ${renderPinnedBookmarks()}
      ${renderReleaseNotes()}
    </main>
  `)
}

function renderProfileCard () {
  return yo`
    <div class="profile">
      ${renderNetworkLink()}
      ${''/*DISABLED <a href=${userProfile.url}>${userProfile.title} <i class="fa fa-user-circle-o"></i></a>*/}
    </div>
  `
}

function renderNetworkLink () {
  return yo`
    <a class="network" href="beaker://library">
      <i class="fa fa-share-alt"></i> ${archivesStatus.peers} ${pluralize(archivesStatus.peers, 'peer')}
    </a>
  `
}

function renderWelcome () {
  if (userSetupStatus === 'skipped' || userSetupStatus === 'completed') return ''
  return yo`
    <div class="beaker-welcome">
      <p>
        Welcome to Beaker!
        <a onclick=${createSite}>Create a peer-to-peer site</a> or
        <a onclick=${takeTour}>take a tour</a>.
        <i onclick=${dismissWelcome} class="fa fa-close"></i>
      </p>
    </div>
  `
}

function renderShelf () {
  if (!isShelfOpen) {
    return yo`
      <div class="shelf closed" onclick=${toggleShelf}>
        <i class="fa fa-angle-left"></i>
      </div>
    `
  }

  return yo`
    <div class="shelf open" onmouseout=${onMouseOutShelf}>
      <div class="section-header">
        <h3><a href="beaker://library">Your library</a></h3>
      </div>
      <div class="archives-list">
        ${archivesList.archives.map(archiveInfo => {
          return yo`
            <a class="archive list-item" href=${`beaker://library/${archiveInfo.key}`}>
              <span class="title">${niceName(archiveInfo)}</span>
              <span class="peers">${archiveInfo.peers} ${pluralize(archiveInfo.peers, 'peer')}</span>
            </a>
          `
        })}
      </div>

      <hr />

      <div class="section-header">
        <h3><a href="beaker://bookmarks">Your bookmarks</a></h3>
      </div>

      <div class="bookmarks-list">
        ${bookmarks.map(row => {
          return yo`
            <a href=${row.url } class="bookmark list-item">
              <img class="favicon" src=${'beaker-favicon:' + row.url} />
              <span href=${row.url} class="bookmark-link" title=${row.title} />
                <span class="title">${row.title}</span>
              </span>
            </a>`
        })}
      </div>
    </div>
  `
}

function renderPinnedBookmarks () {
  var icon = isManagingBookmarks ? 'caret-down' : 'wrench'

  return yo`
    <div class="bookmarks-container">
      <p>
        <a class="add-pin-toggle" onclick=${toggleAddPin}>
          <i class="fa fa-${icon}"></i>
          ${isManagingBookmarks ? 'Close' : 'Manage bookmarks'}
        </a>
      </p>
      <div class="pinned-bookmarks">
        ${pinnedBookmarks.map(renderPinnedBookmark)}
      </div>
      ${renderBookmarks()}
    </div>
  `
}

function renderBookmarks () {
  if (!isManagingBookmarks) {
    return ''
  }

  const isNotPinned = row => !row.pinned

  const renderRow = row =>
    yo`
      <li class="bookmark ll-row">
        <a class="btn pin" onclick=${e => pinBookmark(e, row)}>
          <i class="fa fa-thumb-tack"></i> Pin
        </a>
        <a href=${row.url} class="link" title=${row.title} />
          <img class="favicon" src=${'beaker-favicon:' + row.url} />
          <span class="title">${row.title}</span>
          <span class="url">${row.url}</span>
        </a>
      </li>`

  const unpinnedBookmarks = bookmarks.filter(isNotPinned)
  return yo`
    <div class="bookmarks">
      ${unpinnedBookmarks.length ? unpinnedBookmarks.map(renderRow) : 'All bookmarks are pinned'}
    </div>
  `
}

function renderPinnedBookmark (bookmark) {
  var { url, title } = bookmark
  var [r, g, b] = bookmark.dominantColor || [255, 255, 255]
  return yo`
    <a class="pinned-bookmark ${isManagingBookmarks ? 'nolink' : ''}" href=${isManagingBookmarks ? '' : url}>
      <div class="favicon-container" style="background: rgb(${r}, ${g}, ${b})">
        ${isManagingBookmarks ? yo`<a class="unpin" onclick=${e => unpinBookmark(e, bookmark)}><i class="fa fa-times"></i></a>` : ''}
        <img src=${'beaker-favicon:' + url} class="favicon"/>
      </div>
      <div class="title">${title}</div>
    </a>
  `
}

function renderReleaseNotes () {
  if (!showReleaseNotes) {
    return ''
  }
  return yo`
    <div class="message info">
      <strong>Welcome to the Beaker 0.7 pre-release.</strong>
      Let us know if anything breaks.
    </div>
  `
}

function renderError () {
  if (!error) {
    return ''
  }
  return yo`
    <div class="message error"><i class="fa fa-exclamation-triangle"></i> ${error}</div>
  `
}

// event handlers
// =

function toggleShelf () {
  isShelfOpen = !isShelfOpen
  update()
}

async function createSite () {
  var archive = await DatArchive.create()
  window.location = 'beaker://library/' + archive.url.slice('dat://'.length)
}

async function takeTour () {
  await beakerBrowser.setUserSetupStatus('completed')
  window.location = 'beaker://tour/'
}

async function dismissWelcome () {
  await beakerBrowser.setUserSetupStatus('skipped')
  document.querySelector('.beaker-welcome').remove()
}

function onMouseOutShelf (e) {
  if (!findParent(e.relatedTarget, 'shelf')) {
    isShelfOpen = false
    update()
  }
}

function toggleAddPin (url, title) {
  isManagingBookmarks = !isManagingBookmarks
  update()
}

async function pinBookmark (e, {url}) {
  e.preventDefault()
  e.stopPropagation()

  await beaker.bookmarks.togglePinned(url, true)
  await loadBookmarks()
  update()
}

async function unpinBookmark (e, {url}) {
  e.preventDefault()
  e.stopPropagation()

  await beaker.bookmarks.togglePinned(url, false)
  await loadBookmarks()
  update()
}

// helpers
// =

async function loadBookmarks () {
  bookmarks = (await beaker.bookmarks.list()) || []
  pinnedBookmarks = (await beaker.bookmarks.list({pinned: true})) || []

  // load dominant colors of each pinned bookmark
  await Promise.all(pinnedBookmarks.map(attachDominantColor))
}

function attachDominantColor (bookmark) {
  return new Promise(resolve => {
    var img = new Image()
    img.setAttribute('crossOrigin', 'anonymous')
    img.onload = e => {
      var c = colorThief.getColor(img, 10)
      c[0] = (c[0] / 4)|0 + 192
      c[1] = (c[1] / 4)|0 + 192
      c[2] = (c[2] / 4)|0 + 192
      bookmark.dominantColor = c
      resolve()
    }
    img.onerror = resolve
    img.src = 'beaker-favicon:' + bookmark.url
  })
}

function niceName (archiveInfo) {
  return (archiveInfo.title || '').trim() || 'Untitled'
}
