module.exports = {
    key: '', // key
    secret: '', // 密钥
    
    symbol: 'ftusdt', // 交易对

    // 根据经验, 此值要适中, 因为越大, 成交越慢
    moneyNum: 50, // 每次下单的钱的数量, 比如交易对是 ftusdt, 那么钱就是usdt, 每次买10个usdt

    // 15档, 允许当前有15个未成交的记录, 避免价格波动后总是未成交
    // 如果15, 要保证当前的usdt为 15 * 50 才行
    limit: 15, 

    // 每两个未成交的记录价格相差 0.3%, 比如当前有一个买价是 10元, 当前价格波动到 10.03 时 (10.3-10)/10 * 100 >= 0.3元时才会下第二个买单, 如果只是 10.02不会下单
    // 如果是15档, 那么15*0.3=4.5%, 即支持价格差在4.5%的波动区间下单
    step: 0.3, 

}
