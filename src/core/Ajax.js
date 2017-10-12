import { IS_NODE, isString, parseJSON, emptyImageUrl, UID } from 'core/util';

/**
 * @classdesc
 * Ajax Utilities. It is static and should not be initiated.
 * @class
 * @static
 * @category core
 */
const Ajax = {

    /**
     * Get JSON data by jsonp
     * from https://gist.github.com/gf3/132080/110d1b68d7328d7bfe7e36617f7df85679a08968
     * @param  {String}   url - resource url
     * @param  {Function} cb  - callback function when completed
     */
    jsonp: function (url, callback) {
        // INIT
        const name = '_maptalks_jsonp_' + UID();
        if (url.match(/\?/)) url += '&callback=' + name;
        else url += '?callback=' + name;

        // Create script
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = url;

        // Setup handler
        window[name] = function (data) {
            callback(null, data);
            document.getElementsByTagName('head')[0].removeChild(script);
            script = null;
            delete window[name];
        };

        // Load JSON
        document.getElementsByTagName('head')[0].appendChild(script);
        return this;
    },

    /**
     * Fetch remote resource by HTTP "GET" method
     * @param  {String}   url - resource url
     * @param  {Function} cb  - callback function when completed
     * @param  {Object}   options - request options
     * @param  {Object}   options.headers - HTTP headers
     * @param  {String}   options.responseType - responseType
     * @param  {String}   options.credentials  - if with credentials, set it to "include"
     * @return {Ajax}  Ajax
     * @example
     * maptalks.Ajax.get(
     *     'url/to/resource',
     *     (err, data) => {
     *         if (err) {
     *             throw new Error(err);
     *         }
     *         // do things with data
     *     }
     * );
     */
    get: function (url, cb, options) {
        if (IS_NODE && Ajax.get.node) {
            return Ajax.get.node(url, cb, options);
        }
        const client = Ajax._getClient(cb);
        client.open('GET', url, true);
        if (options) {
            for (const k in options.headers) {
                client.setRequestHeader(k, options.headers[k]);
            }
            client.withCredentials = options.credentials === 'include';
            if (options['responseType']) {
                client.responseType = options['responseType'];
            }
        }
        client.send(null);
        return this;
    },

    /**
     * Fetch remote resource by HTTP "POST" method
     * @param  {Object}   options - post options
     * @param  {String}   options.url - url
     * @param  {Object}   options.headers - HTTP headers
     * @param  {String|Object} postData - data post to server
     * @param  {Function} cb  - callback function when completed
     * @return {Ajax}  Ajax
     * @example
     * maptalks.Ajax.post(
     *     {
     *         'url' : 'url/to/post'
     *     },
     *     {
     *         'param0' : 'val0',
     *         'param1' : 1
     *     },
     *     (err, data) => {
     *         if (err) {
     *             throw new Error(err);
     *         }
     *         // do things with data
     *     }
     * );
     */
    post: function (options, postData, cb) {
        if (IS_NODE && Ajax.post.node) {
            return Ajax.post.node(options, postData, cb);
        }
        const client = Ajax._getClient(cb);
        client.open('POST', options.url, true);
        if (!options.headers) {
            options.headers = {};
        }
        if (!options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        if ('setRequestHeader' in client) {
            for (const p in options.headers) {
                if (options.headers.hasOwnProperty(p)) {
                    client.setRequestHeader(p, options.headers[p]);
                }
            }
        }
        if (!isString(postData)) {
            postData = JSON.stringify(postData);
        }
        client.send(postData);
        return this;
    },

    _wrapCallback: function (client, cb) {
        return function () {
            if (client.readyState === 4) {
                if (client.status === 200) {
                    if (client.responseType === 'arraybuffer') {
                        const response = client.response;
                        if (response.byteLength === 0) {
                            cb(new Error('http status 200 returned without content.'));
                        } else {
                            cb(null, {
                                data: client.response,
                                cacheControl: client.getResponseHeader('Cache-Control'),
                                expires: client.getResponseHeader('Expires'),
                                contentType : client.getResponseHeader('Content-Type')
                            });
                        }
                    } else {
                        cb(null, client.responseText);
                    }
                } else {
                    cb(new Error(client.statusText + ',' + client.status));
                }
            }
        };
    },

    _getClient: function (cb) {
        /*eslint-disable no-empty, no-undef*/
        let client;
        try {
            client = new XMLHttpRequest();
        } catch (e) {
            try { client = new ActiveXObject('Msxml2.XMLHTTP'); } catch (e) {
                try { client = new ActiveXObject('Microsoft.XMLHTTP'); } catch (e) {}
            }
        }
        client.onreadystatechange = Ajax._wrapCallback(client, cb);
        return client;
        /*eslint-enable no-empty, no-undef*/
    },
    /**
     * Fetch resource as arraybuffer.
     * @param {String} url          - url
     * @param {Function} callback   - callback function when completed.
     * @param {Object} options
     * @example
     * maptalks.Ajax.getArrayBuffer(
     *     'url/to/resource.bin',
     *     (err, data) => {
     *         if (err) {
     *             throw new Error(err);
     *         }
     *         // data is a binary array
     *     }
     * );
     */
    getArrayBuffer(url, callback, options) {
        if (!options) {
            options = {};
        }
        options['responseType'] = 'arraybuffer';
        return Ajax.get(url, callback, options);
    },

    // from mapbox-gl-js
    getImage(img, url, options) {
        return Ajax.getArrayBuffer(url, (err, imgData) => {
            if (err) {
                if (img.onerror) {
                    img.onerror(err);
                }
            } else if (imgData) {
                const URL = window.URL || window.webkitURL;
                const onload = img.onload;
                img.onload = () => {
                    if (onload) {
                        onload();
                    }
                    URL.revokeObjectURL(img.src);
                };
                const blob = new Blob([new Uint8Array(imgData.data)], { type: imgData.contentType });
                img.cacheControl = imgData.cacheControl;
                img.expires = imgData.expires;
                img.src = imgData.data.byteLength ? URL.createObjectURL(blob) : emptyImageUrl;
            }
        }, options);
    }
};

/**
 * Fetch resource as a JSON Object.
 * @param {String} url          - json's url
 * @param {Function} callback   - callback function when completed.
 * @param {Object} options      - optional options
 * @param {String} options.jsonp - fetch by jsonp, false by default
 * @example
 * maptalks.Ajax.getJSON(
 *     'url/to/resource.json',
 *     (err, json) => {
 *         if (err) {
 *             throw new Error(err);
 *         }
 *         // json is a JSON Object
 *         console.log(json.foo);
 *     },
 *     { jsonp : true }
 * );
 * @static
 */
Ajax.getJSON = function (url, cb, options) {
    const callback = function (err, resp) {
        const data = resp ? parseJSON(resp) : null;
        cb(err, data);
    };
    if (options && options['jsonp']) {
        return Ajax.jsonp(url, callback);
    }
    return Ajax.get(url, callback, options);
};

export default Ajax;
