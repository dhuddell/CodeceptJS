const Container = require('../container');
const recorder = require('../recorder');
const event = require('../event');
const output = require('../output');
const fs = require('fs');
const path = require('path');
const { fileExists, clearString } = require('../utils');
const Codeceptjs = require('../index');

const defaultConfig = {
  uniqueScreenshotNames: false,
  disableScreenshots: false,
  fullPageScreenshots: false,
};

const supportedHelpers = [
  'Mochawesome',
  'WebDriverIO',
  'WebDriver',
  'Protractor',
  'Appium',
  'Nightmare',
  'Puppeteer',
];

/**
 * Creates screenshot on failure. Screenshot is saved into `output` directory.
 *
 * Initially this functionality was part of corresponding helper but has been moved into plugin since 1.4
 *
 * This plugin is **enabled by default**.
 *
 * ##### Configuration
 *
 * Configuration can either be taken from a corresponding helper (deprecated) or a from plugin config (recommended).
 *
 * ```js
 * "plugins": {
 *    "screenshotOnFail": {
 *      "enabled": true
 *    }
 * }
 * ```
 *
 * Possible config options:
 *
 * * `uniqueScreenshotNames`: use unique names for screenshot. Default: false.
 * * `fullPageScreenshots`: make full page screenshots. Default: false.
 *
 *
 */
module.exports = function (config) {
  const helpers = Container.helpers();
  let helper;

  for (const helperName of supportedHelpers) {
    if (Object.keys(helpers).indexOf(helperName) > -1) {
      helper = helpers[helperName];
    }
  }

  if (!helper) return; // no helpers for screenshot

  const options = Object.assign(defaultConfig, helper.options, config);

  if (helpers.Mochawesome) {
    if (helpers.Mochawesome.config) {
      options.uniqueScreenshotNames = helpers.Mochawesome.config.uniqueScreenshotNames;
    }
  }

  if (Codeceptjs.container.mocha()) {
    options.reportDir = Codeceptjs.container.mocha().options.reporterOptions
      && Codeceptjs.container.mocha().options.reporterOptions.reportDir;
  }


  if (options.disableScreenshots) {
    // old version of disabling screenshots
    return;
  }

  event.dispatcher.on(event.test.failed, (test, fail) => {
    recorder.add('screenshot of failed test', async () => {
      let fileName = clearString(test.title);
      // This prevent data driven to be included in the failed screenshot file name
      if (fileName.indexOf('{') !== -1) {
        fileName = fileName.substr(0, (fileName.indexOf('{') - 3)).trim();
      }
      if (test.ctx && test.ctx.test && test.ctx.test.type === 'hook') fileName = clearString(`${test.title}_${test.ctx.test.title}`);
      if (options.uniqueScreenshotNames) {
        const uuid = test.uuid || test.ctx.test.uuid || Math.floor(new Date().getTime() / 1000);
        fileName = `${fileName.substring(0, 10)}_${uuid}.failed.png`;
      } else {
        fileName += '.failed.png';
      }
      output.plugin('screenshotOnFail', 'Test failed, saving screenshot');

      try {
        if (options.reportDir) {
          fileName = path.join(options.reportDir, fileName);
          const mochaReportDir = path.join(process.cwd(), options.reportDir);
          if (!fileExists(mochaReportDir)) {
            fs.mkdirSync(mochaReportDir);
          }
        }
        await helper.saveScreenshot(fileName, options.fullPageScreenshots);

        if (Container.mocha().options.reporterOptions['mocha-junit-reporter'] && Container.mocha().options.reporterOptions['mocha-junit-reporter'].attachments) {
          test.attachments = [path.join(global.output_dir, fileName)];
        }

        const allureReporter = Container.plugins('allure');
        if (allureReporter) {
          allureReporter.addAttachment('Last Seen Screenshot', fs.readFileSync(path.join(global.output_dir, fileName)), 'image/png');
        }
      } catch (err) {
        if (err &&
            err.type &&
            err.type === 'RuntimeError' &&
            err.message &&
            (err.message.indexOf('was terminated due to') > -1 || err.message.indexOf('no such window: target window already closed') > -1)
        ) {
          helper.isRunning = false;
        }
      }
    }, true);
  });
};
