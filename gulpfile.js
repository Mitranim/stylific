'use strict'

Error.stackTraceLimit = Infinity

/** **************************** Dependencies ********************************/

const $ = require('gulp-load-plugins')()
const bsync = require('browser-sync').create()
const del = require('del')
const flags = require('yargs').boolean('prod').argv
const gulp = require('gulp')
const statil = require('statil')
const statilOptions = require('./statil')

/** ******************************* Globals **********************************/

const src = {
  libStyles: 'scss/**/*.scss',
  libStylesCore: 'scss/stylific.scss',
  libScripts: 'src-js/stylific.js',
  docScripts: [
    'dist/stylific.js',
    'node_modules/simple-pjax/dist/simple-pjax.js'
  ],
  docStylesCore: 'src-docs/styles/docs.scss',
  docStyles: 'src-docs/styles/**/*.scss',
  docHtml: [
    'src-docs/html/**/*',
    'node_modules/font-awesome-svg-png/black/svg/github.svg'
  ],
  docImages: 'src-docs/images/**/*'
}

const destBase = 'gh-pages'

const dest = {
  // Folders.
  dist: 'dist',
  docStyles: destBase + '/styles',
  docScripts: destBase + '/scripts',
  docImages: destBase + '/images',
  docHtml: destBase,

  // Compiled files.
  compiledScript: 'dist/stylific.js',
  compiledStyle: 'dist/stylific.css'
}

function reload (done) {
  bsync.reload()
  done()
}

/** ******************************** Tasks ***********************************/

/* ------------------------------ Lib Styles --------------------------------*/

gulp.task('lib:styles:clear', function (done) {
  del(dest.dist + '/*.css').then(() => void done())
})

gulp.task('lib:styles:compile', function () {
  return gulp.src(src.libStylesCore)
    .pipe($.sass())
    .pipe($.autoprefixer())
    .pipe(gulp.dest(dest.dist))
})

gulp.task('lib:styles:minify', function () {
  return gulp.src(dest.compiledStyle)
    .pipe($.minifyCss({
      keepSpecialComments: 0,
      aggressiveMerging: false,
      advanced: false
    }))
    .pipe($.rename('stylific.min.css'))
    .pipe(gulp.dest(dest.dist))
})

gulp.task('lib:styles:build', gulp.series('lib:styles:clear', 'lib:styles:compile', 'lib:styles:minify'))

gulp.task('lib:styles:watch', function () {
  $.watch(src.libStyles, gulp.series('lib:styles:build'))
})

/* ----------------------------- Lib Scripts --------------------------------*/

gulp.task('lib:scripts:clear', function (done) {
  del(dest.dist + '/*.js').then(() => void done())
})

gulp.task('lib:scripts:compile', function () {
  return gulp.src(src.libScripts)
    .pipe($.babel({
      modules: 'ignore',
      blacklist: ['strict']
    }))
    .pipe($.wrap(
`/**
 * Source and documentation:
 *   https://github.com/Mitranim/stylific
 */

!function() {
'use strict';

// No-op if not running in a browser.
if (typeof window !== 'object' || !window) return;

<%= contents %>

}();`))
    .pipe(gulp.dest(dest.dist))
})

gulp.task('lib:scripts:minify', function () {
  return gulp.src(dest.compiledScript)
    .pipe($.uglify({mangle: true}))
    .pipe($.rename('stylific.min.js'))
    .pipe(gulp.dest(dest.dist))
})

gulp.task('lib:scripts:build', gulp.series('lib:scripts:clear', 'lib:scripts:compile', 'lib:scripts:minify'))

gulp.task('lib:scripts:watch', function () {
  $.watch(src.libScripts, gulp.series('lib:scripts:build'))
})

/* --------------------------------- HTML -----------------------------------*/

gulp.task('docs:html:clear', function (done) {
  del(dest.docHtml + '/**/*.html').then(() => void done())
})

gulp.task('docs:html:compile', function () {
  return gulp.src(src.docHtml)
    .pipe($.statil.withBufferedContents(templates => statil.batch(templates, statilOptions)))
    .pipe(gulp.dest(dest.docHtml))
})

gulp.task('docs:html:build', gulp.series('docs:html:clear', 'docs:html:compile'))

gulp.task('docs:html:watch', function () {
  $.watch(src.docHtml, gulp.series('docs:html:build', reload))
})

/* -------------------------------- Styles ----------------------------------*/

gulp.task('docs:styles:clear', function (done) {
  del(dest.docStyles).then(() => void done())
})

gulp.task('docs:styles:compile', function () {
  return gulp.src(src.docStylesCore)
    .pipe($.sass())
    .pipe($.autoprefixer())
    .pipe($.base64({
      baseDir: '.',
      extensions: ['svg']
    }))
    .pipe($.if(flags.prod, $.minifyCss({
      keepSpecialComments: 0,
      aggressiveMerging: false,
      advanced: false
    })))
    .pipe(gulp.dest(dest.docStyles))
    // bsync stream reload is often buggy for me :(
    // .pipe(bsync.stream())
})

gulp.task('docs:styles:build', gulp.series('docs:styles:clear', 'docs:styles:compile'))

gulp.task('docs:styles:watch', function () {
  $.watch(src.docStyles, gulp.series('docs:styles:build', reload))
  $.watch(src.libStyles, gulp.series('docs:styles:build', reload))
})

/* -------------------------------- Images ----------------------------------*/

gulp.task('docs:images:clear', function (done) {
  del(dest.docImages).then(() => void done())
})

// Resize and copy images
gulp.task('images:normal', function () {
  return gulp.src(src.docImages)
    /**
    * Experience so far.
    * {quality: 1} -> reduces size by ≈66% with no resolution change and no visible quality change
    * {quality: 1, width: 1920} -> reduces size by ≈10 times for hi-res images
    */
    .pipe($.imageResize({
      quality: 1,
      width: 1920,    // max width
      upscale: false
    }))
    .pipe(gulp.dest(dest.docImages))
})

// Minify and copy images.
gulp.task('images:small', function () {
  return gulp.src(src.docImages)
    .pipe($.imageResize({
      quality: 1,
      width: 640,    // max width
      upscale: false
    }))
    .pipe(gulp.dest(dest.docImages + '/small'))
})

// Crop images to small squares
gulp.task('images:square', function () {
  return gulp.src(src.docImages)
    .pipe($.imageResize({
      quality: 1,
      gravity: 'Center',  // crop relative to center
      crop: true,
      width: 640,
      height: 640,
      upscale: false
    }))
    .pipe(gulp.dest(dest.docImages + '/square'))
})

gulp.task('docs:images:build',
  gulp.series('docs:images:clear',
              gulp.parallel('images:normal', 'images:small', 'images:square')))

gulp.task('docs:images:watch', function () {
  $.watch(src.docImages, gulp.series('docs:images:build', reload))
})

/* -------------------------------- Scripts ---------------------------------*/

gulp.task('docs:scripts:clear', function (done) {
  del(dest.docScripts).then(() => void done())
})

gulp.task('docs:scripts:copy', function () {
  return gulp.src(src.docScripts).pipe(gulp.dest(dest.docScripts))
})

gulp.task('docs:scripts:build', gulp.series('docs:scripts:clear', 'docs:scripts:copy'))

gulp.task('docs:scripts:watch', function () {
  $.watch(src.docScripts, gulp.series('docs:scripts:build', reload))
})

/* -------------------------------- Server ----------------------------------*/

gulp.task('server', function () {
  return bsync.init({
    startPath: '/stylific/',
    server: {
      baseDir: dest.docHtml,
      middleware (req, res, next) {
        req.url = req.url.replace(/^\/stylific/, '/')
        next()
      }
    },
    port: 13933,
    online: false,
    ui: false,
    files: false,
    ghostMode: false,
    notify: false
  })
})

/* -------------------------------- Default ---------------------------------*/

gulp.task('lib:build', gulp.parallel('lib:styles:build', 'lib:scripts:build'))

gulp.task('build', gulp.parallel(
  gulp.series('lib:styles:build', 'docs:styles:build'),
  gulp.series('lib:scripts:build', 'docs:scripts:build'),
  'docs:html:build', 'docs:images:build'
))

gulp.task('watch', gulp.parallel(
  'lib:styles:watch', 'lib:scripts:watch',
  'docs:html:watch', 'docs:styles:watch', 'docs:scripts:watch'
))

gulp.task('default', gulp.series('build', gulp.parallel('watch', 'server')))
