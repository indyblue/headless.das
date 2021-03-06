const fs = require('fs');
const ptool = require('path');
const electron = require('electron');
const { app, BrowserWindow } = electron;
const { WebContents } = process.atomBinding('web_contents');
const moment = require('moment');

const EventEmitter = require('events');
class MyEmitter extends EventEmitter { }

function ci(x) { //clean insert
	let xc = JSON.stringify(x);
	return xc;
}

function Headless(url) {
	const myEmitter = new MyEmitter();
	let t = this;
	t.T = function (a, b, c = null) {
		let obj = {
			qs: a,
			get s() { return b(this.qs.map(x => ci(x))); }
		};
		if (c !== null) obj.qr = c;
		return obj;
	}
	t.url = url;
	t.isReady = false;
	t.steps = [];
	let debug = true;
	t.on = (evnt, cb) => {
		if (typeof cb === 'function' && typeof evnt === 'string') myEmitter.on(evnt, cb);
	};
	t.ready = cb => {
		t.on('ready', cb);
		if (t.isReady) myEmitter.emit('ready');
	};

	t.ci = ci;
	let win = null;
	const onReady = x => {
		win = new BrowserWindow({ width: 800, height: 600, show: false });
		win.loadURL(`file://${__dirname}/headless.html`)
		win.on('closed', () => { win = null; });
		const wc = win.webContents;

		const cliPrompt = x => new Promise((r, e) => {
			console.log('continue? (y/n)');
			process.stdin.resume();
			process.stdin.setRawMode(true);
			process.stdin.setEncoding('utf8');

			process.stdin.on('data', function (text) {
				process.stdin.pause();
				console.log('received data:', JSON.stringify(text));
				if (text === 'y') r('continue: ' + text);
				else e('continue: ' + text);
			});
		});

		t.start = (url, cb) => {
			t.debug(true);

			if (typeof url === 'string' && url.length > 0) t.url = url;
			else if (typeof url === 'function') cb = url;
			if (typeof cb !== 'function') cb = x => { };
			let jurl = t.ci(t.url)

			let pr = wc.executeJavaScript(`wload(${jurl})`)
			if (Array.isArray(t.steps)) for (var i = 0; i < t.steps.length; i++) {
				pr = pr.wcThen(wc, t.steps[i], i, debug);
			}
			pr = pr.wcThen(wc, cb, 'final', debug)
				.catch(x => { });
		};

		t.dispose = x => {
			win.close();
		};

		t.debug = x => {
			debug = x;
			if (x && t.isReady) {
				win.show();
				//win.webContents.openDevTools();
				//wc.executeJavaScript(`w.openDevTools()`)
			} else {
				win.hide();
				//wc.executeJavaScript(`w.closeDevTools()`)
			}
		}

		winReady(win).then(x => {
			t.isReady = true;
			myEmitter.emit('ready');
		});
	};

	t.readyStart = (url, cb) => {
		if (win != null) {
			t.dispose();
			return 'headless already running - attempting to dispose';
		}
		if (app.isReady()) onReady();
		else app.once('ready', onReady);
		t.ready(() => {
			t.start(url, cb);
		});
	};


}

Headless.jsonRead = function (fname, isj) {
	let dirname = ptool.dirname(require.main.filename);
	if (typeof isj === 'undefined') isj = true;
	let fpath = fname;
	if (!ptool.isAbsolute(fpath))
		fpath = ptool.join(dirname, fname);
	let json = fs.readFileSync(fpath).toString();
	if (isj) json = JSON.parse(json);
	return json;
};
Headless.jsonWrite = function (fname, data) {
	let dirname = ptool.dirname(require.main.filename);
	let fpath = fname;
	if (!ptool.isAbsolute(fpath))
		fpath = ptool.join(dirname, fname);
	if (typeof data !== 'string')
		data = JSON.stringify(data, null, 3);
	fs.writeFileSync(fpath, data);
	return true;
};

module.exports = Headless;
let rxWait = /^wait-(\d+)$/;
Promise.prototype.wcThen = function (wc, script, i, debug = false) {
	if (typeof i === 'undefined') i = -1
	let pr = this;
	pr = pr.then(x => {
		let d = '';
		if (debug && typeof script === 'string')
			d = script.replace(/\n/g, ' ').trim().substr(0, 40);
		console.log(i, 'start promise', typeof x, d);
		return x;
	});
	if (script === 'wait') {
		pr = pr.then(x => webviewReady(wc));
	} else if (rxWait.test(script)) {
		let delay = rxWait.exec(script)[1];
		pr = pr.then(x => webviewReady(wc, delay));
	} else if (typeof script === 'function') {
		pr = pr.then(script);
	} else {
		pr = pr.then(x => wc.executeJavaScript(`wexec(${ci(script)})`));
	}

	pr = pr.then(x => {
		let d = '';
		//if(debug) d = x;
		if (d instanceof WebContents) d = 'WebContents';
		console.log(i, 'promise success', typeof x, d);
		return x;
	}).catch(x => {
		t.debug(true);
		console.log(i, 'promise error', x);
		return Promise.reject('bye bye');
		//return cliPrompt();
	});
	return pr;
}

function webviewReady(wc, delay) {
	if (typeof delay === 'undefined' || isNaN(delay)) delay = 1;
	let pr = wc.executeJavaScript(`wready(${delay})`);
	return pr;
}

function winReady(win) {
	let wc = win.webContents;

	console.log('winReady start');
	let retval = new Promise((r, e) => {
		wc.once('did-finish-load', x => {
			r(id, 'finish');
		});
		wc.once('did-fail-load', x => {
			e('did-fail-load')
		});
		let id = setTimeout(x => {
			e('timeout 15s')
		}, 15000);
		return id;
	})
		.catch(x => {
			console.log('winReady error: ', x);
		})
		.then(id => {
			clearTimeout(id);
			return new Promise((r, e) => {
				setTimeout(x => {
					r(wc);
					console.log('winReady finish');
				}, 1000);
			});
		});
	return retval;
}


