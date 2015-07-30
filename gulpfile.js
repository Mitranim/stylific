'use strict';

/**
 * Requires gulp 4.0:
 *   "gulp": "git://github.com/gulpjs/gulp#4.0"
 */

/******************************* Dependencies ********************************/

var $      = require('gulp-load-plugins')();
var bsync  = require('browser-sync').create();
var gulp   = require('gulp');
var hjs    = require('highlight.js');
var marked = require('gulp-marked/node_modules/marked');
var flags  = require('yargs').argv;
var pt     = require('path');
var shell  = require('shelljs');

/********************************** Globals **********************************/

var src = {
  libStyles:     'scss/**/*.scss',
  libStylesCore: 'scss/stylific.scss',
  libScripts:    'ts/stylific.ts',
  docScripts: [
    'lib/stylific.min.js',
    'node_modules/simple-pjax/lib/simple-pjax.min.js'
  ],
  docStylesCore:    'src-docs/styles/docs.scss',
  docStyles:        'src-docs/styles/**/*.scss',
  docHtml: [
    'src-docs/html/**/*',
    'bower_components/font-awesome-svg-png/black/**/*.svg'
  ],
  docImages: 'src-docs/images/**/*'
};

var destBase = 'stylific-gh-pages';

var dest = {
  lib:        'lib',
  docStyles:  destBase + '/styles',
  docScripts: destBase + '/scripts',
  docImages:  destBase + '/images',
  docHtml:    destBase
};

function prod() {
  return flags.prod === true || flags.prod === 'true';
}

function reload(done) {
  bsync.reload();
  done();
}

/********************************** Config ***********************************/

/**
 * Change how marked compiles headers to add links to our source files.
 */

var regComponent = /^sf-[a-z-]+$/;
var repoComponentDir = 'https://github.com/Mitranim/stylific/blob/master/scss/components/';

// Default heading renderer func.
var headingDef = marked.Renderer.prototype.heading;

// Custom heading renderer func that adds a link to the component source.
marked.Renderer.prototype.heading = function(text, level) {
  if (regComponent.test(text)) {
    return '<h' + level + ' id="' + text + '"><a href="' + repoComponentDir + text + '.scss" target="_blank">' + text + '</a></h' + level + '>';
  }
  return headingDef.apply(this, arguments);
};

/**
 * Change how marked compiles links to add target="_blank" to links to other sites.
 */

// Default link renderer func.
var linkDef = marked.Renderer.prototype.link;

// Custom link renderer func that adds target="_blank" to links to other sites.
// Mostly copied from the marked source.
marked.Renderer.prototype.link = function(href, title, text) {
  if (this.options.sanitize) {
    try {
      var prot = decodeURIComponent(unescape(href))
        .replace(/[^\w:]/g, '')
        .toLowerCase();
    } catch (e) {
      return '';
    }
    if (prot.indexOf('javascript:') === 0 || prot.indexOf('vbscript:') === 0) {
      return '';
    }
  }
  var out = '<a href="' + href + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  if (/^[a-z]+:\/\//.test(href)) {
    out += ' target="_blank"';
  }
  out += '>' + text + '</a>';
  return out;
};

/*********************************** Tasks ***********************************/

/*----------------------------------- Lib -----------------------------------*/

gulp.task('lib:styles:clear', function() {
  return gulp.src(dest.lib + '/*.css', {read: false, allowEmpty: true})
    .pipe($.plumber())
    .pipe($.rimraf());
});

gulp.task('lib:styles:compile', function() {
  return gulp.src(src.libStylesCore)
    .pipe($.plumber())
    .pipe($.sass())
    .pipe($.autoprefixer())
    .pipe($.if(prod(), $.minifyCss({
      keepSpecialComments: 0,
      aggressiveMerging: false,
      advanced: false
    })))
    .pipe(gulp.dest(dest.lib));
});

gulp.task('lib:scripts:compile', function() {
  return gulp.src(src.libScripts)
    .pipe($.plumber())
    .pipe($.typescript({target: 'ES5'}))
    .pipe(gulp.dest(dest.lib));
});

gulp.task('lib:scripts:minify', function(done) {
  shell.exec('npm run minify', done);
});

gulp.task('lib:build', gulp.series('lib:styles:clear', 'lib:styles:compile', 'lib:scripts:compile', 'lib:scripts:minify'));

gulp.task('lib:watch', function() {
  $.watch(src.libStyles, gulp.series('lib:styles:clear', 'lib:styles:compile'));
  $.watch(src.libScripts, gulp.series('lib:scripts:compile', 'lib:scripts:minify'));
});

/*---------------------------------- HTML -----------------------------------*/

gulp.task('docs:html:clear', function() {
  return gulp.src(dest.docHtml + '/**/*.html', {read: false, allowEmpty: true})
    .pipe($.plumber())
    .pipe($.rimraf());
});

gulp.task('docs:html:compile', function() {
  var filterMd = $.filter('**/*.md')

  return gulp.src(src.docHtml)
    .pipe($.plumber())
    // Pre-process markdown files.
    .pipe(filterMd)
    .pipe($.marked({
      gfm:         true,
      tables:      true,
      breaks:      false,
      sanitize:    false,
      smartypants: false,
      pedantic:    false,
      // Code highlighter.
      highlight: function(code, lang) {
        var result = lang ? hjs.highlight(lang, code) : hjs.highlightAuto(code);
        return result.value;
      }
    }))
    // Add hljs code class.
    .pipe($.replace(/<pre><code class="(.*)">|<pre><code>/g,
                    '<pre><code class="hljs $1">'))
    // Return other files.
    .pipe(filterMd.restore())
    // Unpack commented HTML parts.
    .pipe($.replace(/<!--\s*:((?:[^:]|:(?!\s*-->))*):\s*-->/g, '$1'))
    // Render all html.
    .pipe($.statil())
    // Change each `<filename>` into `<filename>/index.html`.
    .pipe($.rename(function(path) {
      switch (path.basename + path.extname) {
        case 'index.html': case '404.html': return;
      }
      path.dirname = pt.join(path.dirname, path.basename);
      path.basename = 'index';
    }))
    // Write to disk.
    .pipe(gulp.dest(dest.docHtml));
});

gulp.task('docs:html:build', gulp.series('docs:html:clear', 'docs:html:compile'));

gulp.task('docs:html:watch', function() {
  $.watch(src.docHtml, gulp.series('docs:html:build', reload));
});

/*--------------------------------- Styles ----------------------------------*/

gulp.task('docs:styles:clear', function() {
  return gulp.src(dest.docStyles, {read: false, allowEmpty: true})
    .pipe($.plumber())
    .pipe($.rimraf());
});

gulp.task('docs:styles:compile', function() {
  return gulp.src(src.docStylesCore)
    .pipe($.plumber())
    .pipe($.sass())
    .pipe($.autoprefixer())
    .pipe($.base64({
      baseDir: '.',
      extensions: ['svg']
    }))
    .pipe($.if(prod(), $.minifyCss({
      keepSpecialComments: 0,
      aggressiveMerging: false,
      advanced: false
    })))
    .pipe(gulp.dest(dest.docStyles))
    .pipe(bsync.reload({stream: true}));
});

gulp.task('docs:styles:build', gulp.series('docs:styles:clear', 'docs:styles:compile'));

gulp.task('docs:styles:watch', function() {
  $.watch(src.docStyles, gulp.series('docs:styles:build'));
  $.watch(src.libStyles, gulp.series('docs:styles:build'));
});

/*--------------------------------- Images ----------------------------------*/

gulp.task('docs:images:clear', function() {
  return gulp.src(dest.docImages, {read: false, allowEmpty: true}).pipe($.rimraf());
});

// Resize and copy images
gulp.task('images:normal', function() {
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
    .pipe(gulp.dest(dest.docImages));
});

// Minify and copy images.
gulp.task('images:small', function() {
  return gulp.src(src.docImages)
    .pipe($.imageResize({
      quality: 1,
      width: 640,    // max width
      upscale: false
    }))
    .pipe(gulp.dest(dest.docImages + '/small'));
});

// Crop images to small squares
gulp.task('images:square', function() {
  return gulp.src(src.docImages)
    .pipe($.imageResize({
      quality: 1,
      gravity: 'Center',  // crop relative to center
      crop: true,
      width: 640,
      height: 640,
      upscale: false
    }))
    .pipe(gulp.dest(dest.docImages + '/square'));
});

gulp.task('docs:images:build',
  gulp.series('docs:images:clear',
              gulp.parallel('images:normal', 'images:small', 'images:square')));

gulp.task('docs:images:watch', function() {
  $.watch(src.docImages, gulp.series('docs:images:build', reload));
});

/*--------------------------------- Scripts ---------------------------------*/

gulp.task('docs:scripts:clear', function() {
  return gulp.src(dest.docScripts, {read: false, allowEmpty: true})
    .pipe($.plumber())
    .pipe($.rimraf());
});

gulp.task('docs:scripts:copy', function() {
  return gulp.src(src.docScripts).pipe(gulp.dest(dest.docScripts));
});

gulp.task('docs:scripts:build', gulp.series('docs:scripts:clear', 'docs:scripts:copy'));

gulp.task('docs:scripts:watch', function() {
  $.watch(src.docScripts, gulp.series('docs:scripts:build', reload));
});

/*--------------------------------- Server ----------------------------------*/

gulp.task('server', function() {
  return bsync.init({
    startPath: '/stylific/',
    server: {
      baseDir: dest.docHtml,
      middleware: function(req, res, next) {
        req.url = req.url.replace(/^\/stylific/, '/');
        next();
      }
    },
    port: 13933,
    online: false,
    ui: false,
    files: false,
    ghostMode: false,
    notify: true
  });
});

/*--------------------------------- Default ---------------------------------*/

gulp.task('build', gulp.parallel(
  'lib:build', 'docs:html:build', 'docs:styles:build', 'docs:images:build', 'docs:scripts:build'
));

gulp.task('watch', gulp.parallel(
  'lib:watch', 'docs:html:watch', 'docs:styles:watch', 'docs:scripts:watch'
));

gulp.task('default', gulp.series('build', gulp.parallel('watch', 'server')));
