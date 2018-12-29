var rfr = require('rfr');
var exportTransactions = rfr('includes/exporter');
var chai = require('chai')
var expect = require('chai').expect;
var assert = require('chai').assert;
var spies = require('chai-spies');
var db = rfr('includes/models');
var moment = require('moment')

chai.use(spies);

beforeEach(function(done) {
  db.User.create({
    "id": 123,
    "login": "some_user",
    "email": "test@email.com",
    "password": "124"
  }).then(function(user) {
    return db.Wallet.create({
      "id": 123,
      "name": "Some wallet",
      "user_id": user.id
    })
  }).then(function() {
    done()
  })
})

afterEach(function(done) {
  db.Transaction.destroy({
    where: {},
  }).then(function() {
    return db.Wallet.destroy({
      where: {},
    })  
  }).then(function() {
    return db.User.destroy({
      where: {},
    })  
  }).then(function() {
    done()
  })
})

describe("Export transactions from imap server", function() {
  it("parses message from Alpha-Bank", function() {
    var transaction = exportTransactions.parseMessage(`
Карта 4.3433
Со счёта: BY29ALFA30146657530070270000
Перевод (Списание)
Успешно
Сумма:0.20 BYN
Остаток:0.10 BYN
На время:19:46:48
BLR/ONLINE SERVICE/VELCOM PO N TELEFONA: 447494825
29.12.2018 19:46:48
    `)
    assert.ok(transaction["amount"] == 0.20)
    assert.ok(transaction["description"] == "BLR/ONLINE SERVICE/VELCOM PO N TELEFONA: 447494825")
    assert.ok(transaction["datetime"].getTime() == new Date("2018-12-29T19:46:48").getTime())
  })

  it("returns main wallet", function(done) {
    exportTransactions.getWallet()
    .then(function(wallet) {      
      assert.ok(wallet.id == 123)
      assert.ok(wallet.user_id == 123)
      done()
    })
  })

  it("throws exception when no wallet", function(done) {
    db.Wallet.destroy({
      where: {},
    }).then(function() {
      return exportTransactions.getWallet()
    }).catch(function(wallet) {
      assert.ok(true)
      done()
    })
  })

  it("creates transactions by message", function(done) {
    var date = new Date()
    var message = "Test message"

    chai.spy.on(exportTransactions, 'parseMessage', function() {
      return {
        "amount": 1.0,
        "description": "test",
        "datetime": date
      }
    });

    // Check for duplicates also 
    exportTransactions.createTransactions([message, message]) 
    .then(function() {
      return db.Transaction.findOne()  
    }).then(function(transaction) {
      assert.ok(transaction["amount"] == 1)
      assert.ok(transaction["description"] == "test")
      assert.ok(transaction["datetime"] == Math.ceil(date.getTime() / 1000))
      assert.ok(transaction["wallet_id"] == 123)
      return db.Transaction.count()
    }).then(function(transactions) {
      assert.ok(transactions == 1)
      done()
    })
  })

  it("returns today date", function(done) {
    var stringDate = exportTransactions.getToday()
    assert.ok(stringDate == moment().format("MMM DD, YYYY"))
    done()
  })

  it("converts base64 to utf-8 string", function() {
    var base64 = "0JrQsNGA0YLQsCA0LjM0MzMK0KHQviDRgdGH0ZHRgtCwOiBCWTI5QUxGQTMwMTQ2\r\nNjU3NTMwMDcwMjcwMDAwCtCf0LXRgNC10LLQvtC0ICjQodC/0LjRgdCw0L3QuNC1\r\nKQrQo9GB0L/QtdGI0L3QvgrQodGD0LzQvNCwOjAuMjAgQllOCtCe0YHRgtCw0YLQ\r\nvtC6OjAuMTAgQllOCtCd0LAg0LLRgNC10LzRjzoxOTo0Njo0OApCTFIvT05MSU5F\r\nIFNFUlZJQ0UvVkVMQ09NIFBPIE4gVEVMRUZPTkE6IDQ0NzQ5NDgyNQoyOS4xMi4y\r\nMDE4IDE5OjQ2OjQ4DQo="
    var message = exportTransactions.convertBase64ToString(base64)
    assert.ok(message.indexOf("Карта") != -1)
  })

  it("returns message bodies from gmail", function(done) {
    exportTransactions.getMessages(["FROM" , 'click@alfa-bank.by'])
    .then(function(messages) {
      assert.ok(messages[0].indexOf("Карта") != -1)
      done()
    })
  })

  it("returns message bodies from empty gmail", function(done) {
    exportTransactions.getMessages(["FROM" , 'wrong@email.com'])
    .then(function(messages) {
      assert.ok(messages.length == 0)
      done()
    })
  })

  it("synchronizes messages to database", function(done) {
    var testMessages = ["Test", "messages"]
    var testLastDate = "test date"

    var getTodaySpy = chai.spy.on(exportTransactions, 'getToday', function() {
      return testLastDate
    });

    var getMessagesSpy = chai.spy.on(exportTransactions, 'getMessages', function() {
      return new Promise((resolve, reject) => {
        resolve(testMessages)
      })
    });

    var createTransactionsSpy = chai.spy.on(exportTransactions, 'createTransactions', function(messages) {
      return new Promise(function(resolve, reject) {
        resolve()
      })
    });


    exportTransactions.synchronize()
    .then(function() {
      expect(getTodaySpy).to.have.been.called();
      expect(getMessagesSpy).to.have.been.called.with(["FROM" , 'click@alfa-bank.by'], ["SINCE", testLastDate]);
      expect(createTransactionsSpy).to.have.been.called.with(testMessages);
      done()
    })
  })
})