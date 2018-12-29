var rfr = require('rfr');
var exportTransactions = rfr('tools/export_email_transactions');
var chai = require('chai')
var expect = require('chai').expect;
var assert = require('chai').assert;
var spies = require('chai-spies');
var db = rfr('includes/models');
var moment = require('moment')

chai.use(spies);

beforeEach(function(done) {
  db.Transaction.destroy({
    where: {},
  }).then(function() {
    return db.Wallet.destroy({
      where: {},
    })  
  }).then(function() {
    return db.Wallet.create({
      "id": 123,
      "name": "Some wallet"
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

  it("returns main wallet id", function(done) {
    exportTransactions.getWalletId()
    .then(function(walletId) {
      assert.ok(walletId == 123)
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


    exportTransactions.createTransactions([message])  
    .then(function() {
      return db.Transaction.findOne()  
    }).then(function(transaction) {
      assert.ok(transaction["amount"] == 1)
      assert.ok(transaction["description"] == "test")
      assert.ok(transaction["datetime"] == Math.ceil(date.getTime() / 1000))
      assert.ok(transaction["wallet_id"] == 123)
      done()
    })
  })

  it("returns last transaction date", function(done) {
    // WAT The hell with dates?
    var date = new Date(2010, 4, 20)
    var previousDate = new Date(2010, 3, 20)
    db.Transaction.bulkCreate([{
      "datetime": date.getTime() / 1000
    }, {
      "datetime": previousDate.getTime() / 1000
    }]).then(function(transaction) {
      return exportTransactions.getLastTransactionDate()
    }).then(function(date) {
      assert.ok(date == 'May 20, 2010')
      done()
    })
  })

  it("converts base64 to utf-8 string", function() {
    var base64 = "0JrQsNGA0YLQsCA0LjM0MzMK0KHQviDRgdGH0ZHRgtCwOiBCWTI5QUxGQTMwMTQ2\r\nNjU3NTMwMDcwMjcwMDAwCtCf0LXRgNC10LLQvtC0ICjQodC/0LjRgdCw0L3QuNC1\r\nKQrQo9GB0L/QtdGI0L3QvgrQodGD0LzQvNCwOjAuMjAgQllOCtCe0YHRgtCw0YLQ\r\nvtC6OjAuMTAgQllOCtCd0LAg0LLRgNC10LzRjzoxOTo0Njo0OApCTFIvT05MSU5F\r\nIFNFUlZJQ0UvVkVMQ09NIFBPIE4gVEVMRUZPTkE6IDQ0NzQ5NDgyNQoyOS4xMi4y\r\nMDE4IDE5OjQ2OjQ4DQo="
    var message = exportTransactions.convertBase64ToString(base64)
    console.log(message)
    assert.ok(message.indexOf("Карта") != -1)
  })

  it("returns message bodies from gmail", function(done) {
    exportTransactions.getMessages(["FROM" , 'click@alfa-bank.by'])
    .then(function(messages) {
      assert.ok(messages[0].indexOf("Карта") != -1)
      done()
    })
  })

  it("synchronizes messages to database", function(done) {
    var testMessages = ["Test", "messages"]
    var testLastDate = "test date"

    var getMessagesSpy = chai.spy.on(exportTransactions, 'getMessages', function() {
      return new Promise((resolve, reject) => {
        resolve(testMessages)
      })
    });

    var getLastTransactionDateSpy = chai.spy.on(exportTransactions, 'getLastTransactionDate', function() {
      return new Promise(function(resolve, reject) {
        resolve(testLastDate)
      })
    });

    var createTransactionsSpy = chai.spy.on(exportTransactions, 'createTransactions', function(messages) {
      return new Promise(function(resolve, reject) {
        resolve()
      })
    });


    exportTransactions.synchronize()
    .then(function() {
      expect(getLastTransactionDateSpy).to.have.been.called();
      expect(getMessagesSpy).to.have.been.called.with(["SINCE", testLastDate]);
      expect(createTransactionsSpy).to.have.been.called.with(testMessages);
      done()
    })
  })
})