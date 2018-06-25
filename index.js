var api = require('./api')
var fs = require('fs');
var async = require('async');
var needle = require('needle');

var config = require('./config');

var symbol = config.symbol; // 'ftusdt' // 'fteth'
var moneyNum = config.moneyNum; // 0.05 * 1000 // 相当于usdt的数量
var limit = config.limit;

// 如果等了5分钟还要等，则取消之
var lastActiveTime = new Date().getTime()
var lastWarningTime = new Date().getTime()

var ordersM; // id => order, 最多5个
function getOrders () {
    try {
        ordersM = JSON.parse(fs.readFileSync('./data.json', 'utf-8'))
    } catch(e) {
        ordersM = {}
    }
}
function saveOrders () {
    fs.writeFileSync('./data.json', JSON.stringify(ordersM, null, 4))
}
var fees = {
    sell: 0,
    buy: 0,
    sellNum: 0,
    buyNum: 0
}
try {
    fees = JSON.parse(fs.readFileSync('./fees.json', 'utf-8'))
    for (var i in fees) {
        fees[i] = +fees[i]
        if (isNaN(fees[i])) {
            fees[i] = 0
        }
    }
} catch(e) {
    fees = {
        sell: 0,
        buy: 0
    }
}
if (!fees.sellNum) {
    fees.sellNum = 0
}
if (!fees.buyNum) {
    fees.buyNum = 0
}

function writeFees (otherFees, type) {
    fees[type] += (+otherFees)
    fees[type + 'Num']++
    fs.writeFileSync('./fees.json', JSON.stringify(fees))
}

// 买, 最多 limit 档
function buy (orderId, price, amount, cb) {
    api.buy(symbol, price, amount, (err, body) => {
        console.log('买，下单结果', err, body)
        if (orderId) {
            delete ordersM[orderId]
        }
        ordersM[body.data] = {id: body.data, state: 'submitted', side: 'buy'}
        saveOrders()
        cb(err, body)
    })
}

function buyLimit (orderId, price, amount, cb) {
    console.log('buyLimit amount', amount)
    price = +price
    var keys = Object.keys(ordersM)
    if (keys.length >= limit && !orderId) {
        console.log('最多', limit, '档')
        return cb('最多' + limit + '档');
    }

    var prices = []
    var pricesSell = []
    keys.forEach(orderId => {
        var order = ordersM[orderId]
        if (order.price && order.state != 'filled') {
            if (order.side === 'buy') { // 导致所有都是卖出单 买入一成交成卖出, 下次看没有买入的就直接买
                prices.push(+order.price)
            }
            else {
                pricesSell.push(+order.price)
            }
        }
    })
    console.log('prices', prices, pricesSell)

    // sell价最低一个
    // buy价算最高的
    if (pricesSell.length) {
        pricesSell.sort()
        // prices.push(pricesSell[0])
    }

    // 有买单
    if (prices.length) {
        prices.sort()

        var maxPrice = prices[prices.length - 1]
        if (price <= maxPrice) {
            console.log('当前价格 <= maxPrice, 不用下单', price, maxPrice)
            return cb()
        }
        // 1%的差距，不用管
        var cha = (price - maxPrice) / maxPrice * 100
        console.log('buy cha', cha)
        if (cha < config.step) {
            console.log(cha, '太小，不用管')
            return cb(cha + '太小，不用管')
        }
    }
    // 只有卖单了, 就和最低的卖单价格比较
    else if (pricesSell.length) {
        pricesSell.sort()
        var minPrice = pricesSell[0]
        // 如果当前价格 >= minPrice, 没必要下单 买价 >卖价
        if (price >= minPrice) {
            console.log('当前价格 >= min sell Price, 不用下单', price, '>', minPrice)
            return cb()
        }
        // price < maxPrice
        // 1%的差距，不用管
        var cha = (minPrice - price) / price * 100
        console.log('sell cha', cha)
        if (cha < config.step) {
            console.log(cha, '太小，不用管')
            return cb(cha + '太小，不用管')
        }
    }

    api.buy(symbol, price, amount, (err, body) => {
        console.log('limit 买，下单结果', err, body)
        if (orderId) {
            delete ordersM[orderId]
        }
        ordersM[body.data] = {id: body.data, state: 'submitted', side: 'buy'}
        saveOrders()
        cb(err, body)
    })
}

// 卖出
function sell (orderId, curPrice, orderPrice, amount, cb) {
    // 如果当前价格 > 订单买入价格，则卖出是不亏的
    // if (curPrice >= orderPrice) {
        // console.log('现在的价格比买入的>，则卖出相同数量')
        api.sell(symbol, Math.max(+curPrice, +orderPrice), amount, (err, ret) => {
            if (ret && ret.data) {
                if (orderId) {
                    delete ordersM[orderId]
                }
                ordersM[ret.data] = {id: ret.data, orderPrice: '' + orderPrice,  state: 'submitted', side: 'sell'}
                saveOrders()
            }
            cb(err, ret)
        })
    // }
    // else {
    //     console.log('等价格高点...')
    //     cb()
    // }
}

// 处理状态改变的订单
function fixChangedOrder (price, order, cb) {
    // var order = body.data[0] // 第一次订单
    // console.log(order)
    // 还没成单, 看当前价格是否比它小，小则取消
    console.log('order state', order.state)
    if (order.state === 'submitted') {
        console.log('未成交，等待...')
        cb()
    }
    // 已成单
    else if (order.state === 'filled') {
        console.log('当前订单已成交!!')
        // 之前是买入，则现在卖出
        if (order.side === 'buy') {
            // api.getPrice(symbol, (err, price) => {
                console.log('cur price', price)
                price = price + ''
                console.log('之前是买入，则现在尝试卖出...')
                sell(order.id, price, order.price, order.amount, (err, body) => {
                    body && console.log('卖出，下单成功')
                    writeFees(order.fill_fees, 'buy')
                    cb(err, body)
                })
            // })
        }
        else {
            console.log('之前是卖出，交易结束...', order.fill_fees)
            writeFees(order.fill_fees, 'sell')

            delete ordersM[order.id]
            saveOrders()
            cb()
            // // buy (orderId, price, amount, cb)
            // buyLimit(order.id, price, moneyNum/price, (err, body) => {
            //     cb(err, body)
            // })
        }
    }
    else if (order.state === 'canceled') {
        console.log('取消', order.id)
        delete ordersM[order.id]
        saveOrders()
        cb()
    }
    else {
        console.log('其它状态', order.state)
        cb()
    }
}

// 取消很久没有成单的买单
function cancelOrders (cb) {
    var keys = Object.keys(ordersM)
    if (!keys || !keys.length) {
        return cb()
    }

    // 遍历每个订单
    var hasFixedOne = 0
    async.eachSeries(keys, (orderId, cb) => {
        var order = ordersM[orderId]
        if (order.side === 'buy' && order.created_at) {
            var now = new Date().getTime()
            // 超过了1分钟没成交
            if (now - order.created_at >= 1 * 60 * 1000) {
                api.cancelOrder(order.id, () => {
                    console.log('取消成功', order.id)
                    delete ordersM[order.id]
                    saveOrders()
                    cb()
                })
            }
            else {
                cb()
            }
        }
        else {
            cb()
        }
    }, () => {
        cb(null, hasFixedOne)
    })
}

function checkIt (price, m, cb) {
    var keys = Object.keys(ordersM)
    async.eachSeries(keys, (key, cb2) => {
        if (m[key]) {
            return cb2()
        }
        console.log('not exists', key);
        api.orderInfo(key, (err, orderInfo) => {
            if (orderInfo && orderInfo.data && orderInfo.data.id) {
                var orderInfo = orderInfo.data
                if (orderInfo.state === 'canceled') {
                    delete ordersM[key]
                }
                else {
                    for (var i in orderInfo) {
                        ordersM[orderInfo.id][i] = orderInfo[i]
                    }
                    ordersM[orderInfo.id].state = orderInfo.state
                }
            }
            else {
                console.log('order not exists!!', key, orderInfo)
                delete ordersM[key]
            }
            cb2()
        })
    }, () => {
        saveOrders()
        var keys = Object.keys(ordersM)
        console.log('当前订单量', keys.length)

        // 遍历每个订单
        var hasFixedOne = 0
        async.eachSeries(keys, (orderId, cb) => {
            var order = ordersM[orderId]
            // if (order.fixed) {
                // return cb()
            // }
            fixChangedOrder(price, order, (err, data) => {
                if (data) {
                    hasFixedOne++
                }
                cb();
            })
        }, () => {
            if (hasFixedOne) {
                console.log('已处理至少一个', hasFixedOne)
                lastActiveTime = new Date().getTime()
                cb()
            }
            else {
                console.log('没有处理一个，可能是价格不合适, 则尝试取消买入')
                cancelOrders((err, num) => {
                    if (!num) {
                        var now = new Date().getTime()
                        // 5分钟没有活跃了
                        if (now - lastActiveTime >= 5 * 1000 * 60 && now - lastWarningTime > 5000 * 60) {
                            lastWarningTime = now
                            // todo warning msg
                        }
                        console.log('已空闲', (now - lastActiveTime) / 1000, '秒')

                        console.log('没有处理一个，可能是价格不合适, 则尝试买新的')
                        // api.getPrice(symbol, (err, price) => {
                            buyLimit('', price, moneyNum/price, (err, body) => {
                                // console.log('买，下单结果', err, body)
                                cb()
                            })
                        // })
                    }
                    else {
                        lastActiveTime = new Date().getTime()
                        console.log('处理了', num, '个取消订单')
                        cb();
                    }
                }) 
            }
        });
    })
}

function test (price, cb) {
    console.log('cur price', price)
    if (price <= 0) {
        return cb()
    }
    api.listOrders(symbol, (err, body) => {
        if (body.status != 0) {
            console.log('订单查询出错', body)
            return cb();
        }
        // console.log(body.data)
        // return;

        // 得到状态已变更的订单
        // submitted => filled
        var m = {}
        if (body.data) {
            body.data.forEach(item => {
                m[item.id] = item
                if (ordersM[item.id]) { //  && ordersM[item.id].state != item.state
                    for (var i in item) {
                        ordersM[item.id][i] = item[i]
                    }
                    ordersM[item.id].state = item.state
                    // 当前未处理
                    // ordersM[item.id].fixed = false
                }
            })
        }

        // some not exists ?
        var keys = Object.keys(ordersM)
        var hasNotExists = false
        for (var i = 0; i < keys.length; ++i) {
            var id = ordersM[keys[i]].id
            if (!m[id]) {
                hasNotExists = true;
                break;
            }
        }

        if (hasNotExists) {
            console.log('hasNotExists listSubmittedOrders')
            api.listSubmittedOrders(symbol, (err, body) => {
                if (body.data) {
                    body.data.forEach(item => {
                        m[item.id] = item
                        if (ordersM[item.id]) { //  && ordersM[item.id].state != item.state
                            for (var i in item) {
                                ordersM[item.id][i] = item[i]
                            }
                            ordersM[item.id].state = item.state
                        }
                    })
                }
                // not exists ?
                checkIt(price, m, cb)
            })
        }
        else {
            // not exists ?
            checkIt(price, m, cb)
        }
    })
}

getOrders();
i = 0;
function goo () {
    console.log(i++, '--------------', Object.keys(ordersM).length)
    api.getPrice(symbol, (err, price) => {
        test(price, () => {
            setTimeout(() => {
                goo()
            }, 0)
        }, false) // i === 1
    })
}
goo()
