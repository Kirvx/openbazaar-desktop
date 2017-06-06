import $ from 'jquery';
import {
  // acceptingOrder,
  // acceptOrder,
  // rejectingOrder,
  // rejectOrder,
  cancelingOrder,
  cancelOrder,
  events as orderEvents,
} from '../../../../utils/order';
import baseVw from '../../../baseVw';
import Payment from './Payment';

export default class extends baseVw {
  constructor(options = {}) {
    const opts = {
      ...options,
    };

    if (!options.orderId) {
      throw new Error('Please provide the order id.');
    }

    if (!options.collection) {
      throw new Error('Please provide a transactions collection.');
    }

    if (typeof options.orderPrice !== 'number') {
      throw new Error('Please provide the price of the order.');
    }

    if (typeof options.isOrderCancelable !== 'function') {
      throw new Error('Please provide a function that returns whether this order can be canceled ' +
        'by the current user.');
    }

    if (typeof options.isOrderConfirmable !== 'function') {
      throw new Error('Please provide a function that returns whether this order can be ' +
        'confirmed by the current user.');
    }

    const isValidParticipantObject = (participant) => {
      let isValid = true;
      if (!participant.id) isValid = false;
      if (typeof participant.getProfile !== 'function') isValid = false;
      return isValid;
    };

    const getInvalidParticpantError = (type = '') =>
      (`The ${type} object is not valid. It should have an id ` +
        'as well as a getProfile function that returns a promise that ' +
        'resolves with a profile model.');

    if (!opts.vendor) {
      throw new Error('Please provide a vendor object.');
    }

    if (!isValidParticipantObject(options.vendor)) {
      throw new Error(getInvalidParticpantError('vendor'));
    }

    super(opts);
    this.options = opts;
    this.orderId = this.options.orderId;
    this.payments = [];

    this.listenTo(this.collection, 'update', () => this.render());
    this.listenTo(orderEvents, 'cancelingOrder', this.onCancelingOrder);
    this.listenTo(orderEvents, 'cancelOrderComplete, cancelOrderFail',
      this.onCancelOrderAlways);
    this.listenTo(orderEvents, 'cancelOrderComplete', this.onCancelOrderComplete);
  }

  className() {
    return 'payments';
  }

  onCancelClick() {
    cancelOrder(this.orderId);
  }

  onCancelingOrder(e) {
    if (e.id === this.orderId) {
      this.payments[this.payments.length - 1].setState({ cancelInProgress: true });
    }
  }

  onCancelOrderAlways(e) {
    if (e.id === this.orderId) {
      this.payments[this.payments.length - 1].setState({ cancelInProgress: false });
    }
  }

  onCancelOrderComplete(e) {
    if (e.id === this.orderId) {
      this.payments[this.payments.length - 1].setState({ showCancelButton: false });
    }
  }

  createPayment(model, options = {}) {
    if (!model) {
      throw new Error('Please provide a model.');
    }

    const payment = this.createChild(Payment, {
      ...options,
      model,
      initialState: {
        ...options.initialState,
      },
    });

    this.listenTo(payment, 'cancelClick', this.onCancelClick);
    this.payments.push(payment);

    return payment;
  }

  render() {
    const paymentsContainer = document.createDocumentFragment();

    this.payments.forEach(payment => (payment.remove()));
    this.payments = [];

    this.collection.models.forEach((payment, index) => {
      const paidSoFar = this.collection.models
        .slice(0, index + 1)
        .reduce((total, model) => total + model.get('value'), 0);
      const isMostRecentPayment = index === this.collection.length - 1;
      const paymentView = this.createPayment(payment, {
        initialState: {
          paymentNumber: index + 1,
          amountShort: this.options.orderPrice - paidSoFar,
          showAcceptRejectButtons: isMostRecentPayment && this.options.isOrderConfirmable(),
          showCancelButton: isMostRecentPayment && this.options.isOrderCancelable(),
          cancelInProgress: cancelingOrder(this.orderId),
        },
      });

      if (payment.get('value') < 0) {
        // the buyer name is needed for a refund
        this.options.buyer.getProfile()
          .done(profile => {
            paymentView.setState({ buyerName: profile.get('name') });
          });
      }

      $(paymentsContainer).prepend(paymentView.render().el);
    });

    if (this.payments.length) {
      this.options.vendor.getProfile()
        .done(profile => {
          this.payments.forEach(payment => payment.setState({ payee: profile.get('name') || '' }));
        });
    }

    this.$el.empty()
      .append(paymentsContainer);

    return this;
  }
}
