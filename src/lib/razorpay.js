const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Razorpay SDK. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

/**
 * Opens the Razorpay checkout modal for a subscription.
 * subscriptionId must be created server-side via the Firebase Cloud Function
 * `createRazorpaySubscription` before calling this.
 */
export async function openRazorpayCheckout({ subscriptionId, orgName, email, phone, description, onSuccess, onFailure }) {
  if (!RAZORPAY_KEY_ID) {
    onFailure?.('Razorpay key not configured. Set VITE_RAZORPAY_KEY_ID in your .env file.');
    return;
  }

  try {
    await loadScript();
  } catch (err) {
    onFailure?.(err.message);
    return;
  }

  const options = {
    key: RAZORPAY_KEY_ID,
    subscription_id: subscriptionId,
    name: 'PayrollSaaS',
    description: description || 'Subscription',
    prefill: {
      name: orgName || '',
      email: email || '',
      contact: phone || '',
    },
    theme: { color: '#d4a04a' },
    handler(response) {
      onSuccess?.(response);
    },
    modal: {
      ondismiss() {
        onFailure?.('checkout_dismissed');
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (response) => {
    onFailure?.(response.error?.description || 'Payment failed. Please try again.');
  });
  rzp.open();
}
