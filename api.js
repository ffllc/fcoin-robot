var needle = require('needle')
var crypto = require('crypto')
var config = require('./config')

var urls = {
  order: "https://api.fcoin.com/v2/orders",
  market: "wss://api.fcoin.com/v2/ws",
  marketHttp: "https://api.fcoin.com/v2/market",
  balance: "https://api.fcoin.com/v2/accounts/balance"
}

var api = {
    serverTime () {
        needle.get('https://api.fcoin.com/v2/public/server-time', (err, ret, body) => {
            console.log(body) // { status: 0, data: 1529141584646 }
        })
    },

    deep () {
        needle.get('https://api.fcoin.com/v2/market/depth/L20/btcusdt', {json: true}, (err, ret, body) => {
            console.log(body + '') // { status: 0, data: 1529141584646 }
            /*
            {"status":0,"data":{"bids":[6455.080000000,1.559000000,6455.070000000,1.615862827,6455.040000000,1.884900000,6455.000000000,5.002500000,6454.980000000,0.270975384,6454.950000000,0.837900000,6454.930000000,0.040000000,6454.920000000,1.802949208,6454.860000000,0.018000000,6454.850000000,1.164189929,6454.790000000,0.004000000,6454.140000000,0.001000000,6454.110000000,0.500000000,6453.500000000,0.486400000,6453.480000000,0.200000000,6453.470000000,0.300000000,6453.440000000,0.300000000,6453.430000000,1.854000000,6453.420000000,0.101000000,6453.410000000,0.032000000],"asks":[6455.100000000,0.983375942,6455.110000000,0.181650840,6455.120000000,8.136984051,6455.130000000,2.130300456,6455.150000000,2.599179875,6455.160000000,0.063000000,6455.540000000,0.831500600,6455.560000000,0.228735629,6456.690000000,0.030000000,6457.820000000,0.030000000,6458.380000000,0.005000000,6459.320000000,0.028766787,6459.410000000,0.006500000,6459.450000000,0.030000000,6460.760000000,0.610000000,6460.790000000,0.001000000,6460.800000000,2.216800000,6460.900000000,0.040200000,6461.230000000,0.050000000,6461.500000000,0.050000000],"ts":1529141740005,"seq":40569481,"type":"depth.L20.btcusdt"}}
             */
        })
    },

    getQueryString (params) {
        var keys = []
        for (var i in params) {
            keys.push(i)
        }
        keys.sort();
        var p = []
        keys.forEach(item => {
            p.push(item + '=' + params[item]) // encodeURIComponent
        })
        var queryString = p.join('&')
        return queryString
    },

    base64 (str) {
        var b = new Buffer(str);
        return b.toString('base64');
    },

    sign (text, secret) {
        var base64Text = this.base64(text)
        var sign = crypto.createHmac('sha1', secret).update(base64Text).digest().toString('base64'); 
        return sign
    },

    // max 20
    fetch (method, uri, getParams, postParams, cb, num) {
        var me = this
        // HTTP_METHOD + HTTP_REQUEST_URI + TIMESTAMP + POST_BODY
        var fullUrl = uri
        if (!num) {
            num = 1;
        }
        if (num > 20) {
            return cb(null, {})
        }
        
        var queryString = this.getQueryString(getParams)
        if (method === 'GET' && queryString) {
            fullUrl += '?' + queryString
        }

        var postQueryString = this.getQueryString(postParams)

        var timestamp = new Date().getTime()
        var text = method + fullUrl + timestamp + postQueryString

        // console.log('text', text)
        // console.log('fullUrl', fullUrl)

        var key = config.key;
        var secret = config.secret

        var sign = this.sign(text, secret)
        var headers = {
            'FC-ACCESS-KEY': key,
            'FC-ACCESS-SIGNATURE': sign,
            'FC-ACCESS-TIMESTAMP': timestamp
        }
        function fixCb (err, ret, body) {
            if (err) {
                console.log(uri, '错误', err)
                return me.fetch(method, uri, getParams, postParams, cb)
            }
            if (body && body instanceof Buffer) {
                var body = JSON.parse(body + '')
            }
            if (body.status === 0) { 
                return cb(err, body)
            }
            else if (body.status === 1001) { // bad argument: vP47-IMJtQnIzSVj4v5Zm_Le7VpTNBaegY1f-AnO0Ya=
                return cb(err, body)
            }
            else {
                console.log(uri, '错误2', body)

                if (uri.indexOf('submit-cancel') > 0 ) {
                    if (body && body.status == 429) {
                        return me.fetch(method, uri, getParams, postParams, cb, num)
                    }
                    else {
                        return cb()
                    }
                }

                if (uri.indexOf('v2/orders') > 0 && body && body.status == 429) {
                    console.log('api exceed')
                    setTimeout(() => {
                        return me.fetch(method, uri, getParams, postParams, cb, num)
                    }, 500)
                }
                else {
                    return me.fetch(method, uri, getParams, postParams, cb, num)
                }
            }
        }
        if (method === 'GET') {
            needle.get(fullUrl, {headers: headers}, fixCb)
        }
        else {
            needle.post(fullUrl, postParams, {json: true, headers: headers}, fixCb)
        }
    },

    balance () {
        this.fetch('GET', 'https://api.fcoin.com/v2/accounts/balance', {}, {}, (err, body) => {
            console.log(body) // { status: 0, data: 1529141584646 }
        })
    },

    // 买
    addOrder (side, symbol, price, amount, cb) {
        var amount = +(amount + '')
        var amount = amount.toFixed(3) + '' // some market limit decimal 2 or 3
        var arr = amount.split('')
        arr.pop()
        amount = arr.join('')
        var postData = {
            "type": "limit",
            "side": side, // "buy",
            "amount": amount + '',
            "price": price + '',
            "symbol": symbol
        }
        console.log(postData)
        this.fetch('POST', 'https://api.fcoin.com/v2/orders', {}, postData, cb)
    },

    buy (symbol, price, amount, cb) {
        this.addOrder ('buy', symbol, price, amount, cb)
    },

    sell (symbol, price, amount, cb) {
        this.addOrder ('sell', symbol, price, amount, cb)
    },

    // 查询订单
    listOrders (symbol, cb) {
        var queryData = {
            symbol: symbol,
            states: 'submitted,filled,canceled', // 'submitted,partial_filled,partial_canceled,filled,canceled' pending_cancel
        }
        this.fetch('GET', 'https://api.fcoin.com/v2/orders', queryData, {}, cb)
    },

    listSubmittedOrders (symbol, cb) {
        var queryData = {
            symbol: symbol,
            states: 'submitted', // 'submitted,partial_filled,partial_canceled,filled,canceled' pending_cancel
        }
        this.fetch('GET', 'https://api.fcoin.com/v2/orders', queryData, {}, cb)
    },

    cancelOrder (orderId, cb) {
        var postData = {
        }
        this.fetch('POST', 'https://api.fcoin.com/v2/orders/' + orderId + '/submit-cancel', {}, postData, cb)
    },

    orderInfo (orderId, cb) {
        var postData = {
        }
        this.fetch('GET', 'https://api.fcoin.com/v2/orders/' + orderId, {}, postData, cb)
    },

    marketHttp (symbol, cb) {
        var queryData = {
        }
        this.fetch('GET', `${urls.marketHttp}/ticker/${symbol}`, queryData, {}, cb)
    },

    getPrice (symbol, cb) {
        this.marketHttp(symbol, (err, body) => {
            if (body && body.data && body.data.ticker[0]) {
                return cb(null, body.data.ticker[0])
            }
            else {
                cb('no price')
            }
        })
    }
}

module.exports = api;