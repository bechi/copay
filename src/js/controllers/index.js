'use strict';

angular.module('copayApp.controllers').controller('indexController', function($rootScope, $scope, $log, $filter, $timeout, lodash, go, profileService, configService, isCordova, rateService, storageService) {
  var self = this;
  self.isCordova = isCordova;

  function strip(number) {
    return (parseFloat(number.toPrecision(12)));
  };

  self.setFocusedWallet = function() {
    var fc = profileService.focusedClient;
    if (!fc) return;

    $timeout(function() {
      self.hasProfile = true;

      // Credentials Shortcuts 
      self.m = fc.credentials.m;
      self.n = fc.credentials.n;
      self.network = fc.credentials.network;
      self.copayerId = fc.credentials.copayerId;
      self.copayerName = fc.credentials.copayerName;
      self.requiresMultipleSignatures = fc.credentials.m > 1;
      self.isShared = fc.credentials.n > 1;
      self.walletName = fc.credentials.walletName;
      self.walletId = fc.credentials.walletId;
      self.isComplete = fc.isComplete();
      self.txps = [];
      self.copayers = [];
    });
    self.openWallet();
  };

  self.updateAll = function() {
    var fc = profileService.focusedClient;
    if (!fc) return;
    self.updatingStatus = true;
    $log.debug('Updating Status:', fc);
    fc.getStatus(function(err, walletStatus) {
      if (err) {
        $log.debug('Wallet Status ERROR:', err);
        $scope.$emit('Local/ClientError', err);
      } else {
        $log.debug('Wallet Status:', walletStatus);
        self.setBalance(walletStatus.balance);
        self.txps = self.setPendingTxps(walletStatus.pendingTxps);

        // Status Shortcuts
        self.walletName = walletStatus.wallet.name;
        self.walletSecret = walletStatus.wallet.secret;
        self.walletStatus = walletStatus.wallet.status;
        self.copayers = walletStatus.wallet.copayers;
      }
      self.updatingStatus = false;
      $rootScope.$apply();
    });
  };

  self.updateBalance = function() {
    var fc = profileService.focusedClient;
    self.updatingBalance = true;
    $log.debug('Updating Balance');
    fc.getBalance(function(err, balance) {
      if (err) {
        $log.debug('Wallet Balance ERROR:', err);
        $scope.$emit('Local/ClientError', err);
      } else {
        $log.debug('Wallet Balance:', balance);
        self.setBalance(balance);
      }
      self.updatingBalance = false;
      $rootScope.$apply();
    });
  };

  self.updatePendingTxps = function() {
    var fc = profileService.focusedClient;
    self.updatingPendingTxps = true;
    $log.debug('Updating PendingTxps');
    fc.getTxProposals({}, function(err, txps) {
      if (err) {
        $log.debug('Wallet PendingTxps ERROR:', err);
        $scope.$emit('Local/ClientError', err);
      } else {
        $log.debug('Wallet PendingTxps:', txps);
        self.txps = self.setPendingTxps(txps);
      }
      self.updatingPendingTxps = false;
      $rootScope.$apply();
    });
  };

  self.openWallet = function() {
    var fc = profileService.focusedClient;
    self.openingWallet = true;
    $timeout(function() {
      fc.openWallet(function(err) {
        if (err) {
          $log.debug('Wallet Open ERROR:', err);
          $scope.$emit('Local/ClientError', err);
        } else {
          $log.debug('Wallet Opened');
          self.updateAll();
        }
        self.openingWallet = false;
        $rootScope.$apply();
      });
    });
  };

  self.setPendingTxps = function(txps) {
    var config = configService.getSync().wallet.settings;
    self.pendingTxProposalsCountForUs = 0;
    lodash.each(txps, function(tx) {
      var amount = tx.amount * self.satToUnit;
      tx.amountStr = profileService.formatAmount(tx.amount) + ' ' + config.unitName;
      tx.alternativeAmount = rateService.toFiat(tx.amount, config.alternativeIsoCode) ? rateService.toFiat(tx.amount, config.alternativeIsoCode).toFixed(2) : 'N/A';
      tx.alternativeAmountStr = tx.alternativeAmount + " " + config.alternativeIsoCode;
      tx.alternativeIsoCode = config.alternativeIsoCode;

      var action = lodash.find(tx.actions, {
        copayerId: self.copayerId
      });
      if (!action && tx.status == 'pending')
        tx.pendingForUs = true;

      if (tx.creatorId != self.copayerId) {
        self.pendingTxProposalsCountForUs = self.pendingTxProposalsCountForUs + 1;
      }
    });
    return txps;
  };

  self.setBalance = function(balance) {
    var config = configService.getSync().wallet.settings;
    var COIN = 1e8;

    // Address with Balance
    self.balanceByAddress = balance.byAddress;

    // SAT
    self.totalBalanceSat = balance.totalAmount;
    self.lockedBalanceSat = balance.lockedAmount;
    self.availableBalanceSat = self.totalBalanceSat - self.lockedBalanceSat;

    // Selected unit
    self.unitToSatoshi = config.unitToSatoshi;
    self.satToUnit = 1 / self.unitToSatoshi;
    self.unitName = config.unitName;

    self.totalBalance = strip(self.totalBalanceSat * self.satToUnit);
    self.lockedBalance = strip(self.lockedBalanceSat * self.satToUnit);
    self.availableBalance = strip(self.availableBalanceSat * self.satToUnit);

    // BTC
    self.totalBalanceBTC = strip(self.totalBalanceSat / COIN);
    self.lockedBalanceBTC = strip(self.lockedBalanceSat / COIN);
    self.availableBalanceBTC = strip(self.availableBalanceBTC / COIN);


    //STR
    self.totalBalanceStr = profileService.formatAmount(self.totalBalanceSat) + ' ' + self.unitName;
    self.lockedBalanceStr = profileService.formatAmount(self.lockedBalanceSat) + ' ' + self.unitName;
    self.availableBalanceStr = profileService.formatAmount(self.availableBalanceSat) + ' ' + self.unitName;

    self.alternativeName = config.alternativeName;
    self.alternativeIsoCode = config.alternativeIsoCode;

    // var availableBalanceNr = safeBalanceSat * satToUnit;
    // r.safeUnspentCount = safeUnspentCount;

    // if (r.safeUnspentCount) {
    //   var estimatedFee = copay.Wallet.estimatedFee(r.safeUnspentCount);
    //   r.topAmount = (((availableBalanceNr * w.settings.unitToSatoshi).toFixed(0) - estimatedFee) / w.settings.unitToSatoshi);
    // }
    //

    rateService.whenAvailable(function() {


      var totalBalanceAlternative = rateService.toFiat(self.totalBalance * self.unitToSatoshi, self.alternativeIsoCode);
      var lockedBalanceAlternative = rateService.toFiat(self.lockedBalance * self.unitToSatoshi, self.alternativeIsoCode);
      var alternativeConversionRate = rateService.toFiat(100000000, self.alternativeIsoCode);

      self.totalBalanceAlternative = $filter('noFractionNumber')(totalBalanceAlternative, 2);
      self.lockedBalanceAlternative = $filter('noFractionNumber')(lockedBalanceAlternative, 2);
      self.alternativeConversionRate = $filter('noFractionNumber')(alternativeConversionRate, 2);

      self.alternativeBalanceAvailable = true;

      self.alternativeBalanceAvailable = true;
      self.updatingBalance = false;

      self.isRateAvailable = true;
      $rootScope.$apply();
    });

    // Check address
    self.checkLastAddress(balance.byAddress);
  };

  self.checkLastAddress = function(byAddress, cb) {
    storageService.getLastAddress(self.walletId, function(err, addr) {
      var used = lodash.find(byAddress, {
        address: addr
      });
      if (used) {
        $log.debug('Address ' + addr + ' was used. Cleaning Cache.')
        $rootScope.$emit('Local/NeedNewAddress', err);
        storageService.clearLastAddress(self.walletId, function(err, addr) {
          if (cb) return cb();
        });
      };
    });
  };

  self.openMenu = function() {
    go.swipe(true);
  }

  self.closeMenu = function() {
    go.swipe();
  }


  // UX event handlers

  $rootScope.$on('Local/ConfigurationUpdated', function(event) {
    self.updateAll();
  });

  $rootScope.$on('Local/WalletCompleted', function(event) {
    go.walletHome();
  });

  $rootScope.$on('Local/OnLine', function(event) {
    self.isOffLine = false;
    self.updateAll();
  });

  $rootScope.$on('Local/OffLine', function(event) {
    self.isOffLine = true;
  });

  $rootScope.$on('Local/ClientError', function(event, err) {
    self.clientError = err;
    $rootScope.$apply();
  });

  lodash.each(['NewTxProposal', 'TxProposalFinallyRejected', 'NewOutgoingTx',
    'NewIncomingTx', 'ScanFinished',
    'Local/NewTxProposal', 'Local/TxProposalAction'
  ], function(eventName) {
    $rootScope.$on(eventName, function() {
      self.updateAll();
    });
  });


  lodash.each(['TxProposalRejectedBy', 'TxProposalAcceptedBy'], function(eventName) {
    $rootScope.$on(eventName, function() {
      self.updatePendingTxps();
    });
  });

  $rootScope.$on('Local/NoWallets', function() {
    go.addWallet();
  });

  $rootScope.$on('Local/NewFocusedWallet', function() {
    self.setFocusedWallet();
  });

  lodash.each(['NewCopayer', 'CopayerUpdated'], function(eventName) {
    $rootScope.$on(eventName, function() {
      // Re try to open wallet (will triggers) 
      self.setFocusedWallet();
    });
  });
});
