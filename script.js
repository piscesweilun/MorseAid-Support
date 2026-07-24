(() => {
  const body = document.body;
  const languageButtons = document.querySelectorAll("[data-language]");
  const preferredLanguage = navigator.language.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
  let currentLanguage = preferredLanguage;

  const messages = {
    zh: {
      ready: "準備就緒，等待手動開始。",
      audioRunning: "正在重複播放聲音 SOS，最長 60 秒。",
      audioStopped: "聲音測試已停止。",
      audioComplete: "聲音測試已在 60 秒後自動停止。",
      audioUnavailable: "此瀏覽器不支援 Web Audio，請改用最新版 Safari、Chrome 或 Edge。",
      audioError: "無法啟動聲音。請確認裝置未靜音，並再試一次。",
      flashRunning: "正在重複顯示閃光 SOS，最長 60 秒。",
      flashStopped: "閃光測試已停止。",
      flashComplete: "閃光測試已在 60 秒後自動停止。",
      flashWarning:
        "即將顯示重複閃光。光敏感使用者請勿啟動。確定要開始嗎？",
    },
    en: {
      ready: "Ready. Every test requires a manual start.",
      audioRunning: "Repeating audio SOS for up to 60 seconds.",
      audioStopped: "Audio test stopped.",
      audioComplete: "Audio test stopped automatically after 60 seconds.",
      audioUnavailable:
        "Web Audio is not supported here. Use a current version of Safari, Chrome, or Edge.",
      audioError:
        "Audio could not start. Check that the device is not muted, then try again.",
      flashRunning: "Repeating optical SOS for up to 60 seconds.",
      flashStopped: "Flashing-light test stopped.",
      flashComplete:
        "Flashing-light test stopped automatically after 60 seconds.",
      flashWarning:
        "A repeating flashing light is about to start. Do not continue if you are photosensitive. Start the test?",
    },
  };

  const signalTest = document.querySelector("[data-signal-test]");
  let audioStatusKey = "ready";
  let flashStatusKey = "ready";

  function translated(key) {
    return messages[currentLanguage][key];
  }

  function refreshStatuses() {
    if (!signalTest) return;
    document.querySelector("[data-audio-status]").textContent =
      translated(audioStatusKey);
    document.querySelector("[data-flash-status]").textContent =
      translated(flashStatusKey);
  }

  function setLanguage(language) {
    currentLanguage = language;
    body.dataset.lang = language;
    document.documentElement.lang = language === "zh" ? "zh-Hant" : "en";

    languageButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === language),
      );
    });
    refreshStatuses();
  }

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setLanguage(button.dataset.language);
    });
  });

  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  if (!signalTest) {
    setLanguage(preferredLanguage);
    return;
  }

  const DOT_MILLISECONDS = 150;
  const DOT_SECONDS = DOT_MILLISECONDS / 1000;
  const TEST_LIMIT_MILLISECONDS = 60_000;
  const TEST_LIMIT_SECONDS = TEST_LIMIT_MILLISECONDS / 1000;
  const SOS_SIGNALS = [1, 1, 1, 3, 3, 3, 1, 1, 1];
  const SOS_EVENTS = SOS_SIGNALS.flatMap((units, index) => [
    { isOn: true, units },
    { isOn: false, units: index === SOS_SIGNALS.length - 1 ? 7 : 1 },
  ]);

  const startAudioButton = document.querySelector("[data-start-audio]");
  const stopAudioButton = document.querySelector("[data-stop-audio]");
  const requestFlashButton = document.querySelector("[data-request-flash]");
  const stopFlashButton = document.querySelector("[data-stop-flash]");
  const stopAllButton = document.querySelector("[data-stop-all]");
  const audioVisual = document.querySelector(".audio-test-visual");
  const opticalStage = document.querySelector("[data-optical-stage]");
  const flashDialog = document.querySelector("[data-flash-dialog]");

  let audioSession = null;
  let flashRunToken = 0;
  let flashRunning = false;

  function updateTestControls() {
    const audioRunning = audioSession !== null;
    startAudioButton.disabled = audioRunning;
    stopAudioButton.disabled = !audioRunning;
    requestFlashButton.disabled = flashRunning;
    stopFlashButton.disabled = !flashRunning;
    stopAllButton.disabled = !audioRunning && !flashRunning;
    audioVisual.classList.toggle("is-running", audioRunning);
  }

  function setAudioStatus(key) {
    audioStatusKey = key;
    refreshStatuses();
  }

  function setFlashStatus(key) {
    flashStatusKey = key;
    refreshStatuses();
  }

  function finishAudioSession(session, statusKey) {
    if (audioSession !== session) return;
    audioSession = null;
    session.oscillator.disconnect();
    session.gain.disconnect();
    session.context.close().catch(() => {});
    setAudioStatus(statusKey);
    updateTestControls();
  }

  function stopAudio(statusKey = "audioStopped") {
    const session = audioSession;
    if (!session) return;
    audioSession = null;
    session.oscillator.onended = null;
    try {
      session.oscillator.stop();
    } catch {
      // The scheduled oscillator may already have ended.
    }
    session.oscillator.disconnect();
    session.gain.disconnect();
    session.context.close().catch(() => {});
    setAudioStatus(statusKey);
    updateTestControls();
  }

  async function startAudio() {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setAudioStatus("audioUnavailable");
      return;
    }

    stopAudio();

    let context = null;
    try {
      context = new AudioContextClass();
      await context.resume();

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 650;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(context.destination);

      const startTime = context.currentTime + 0.05;
      const deadline = startTime + TEST_LIMIT_SECONDS;
      let cursor = startTime;

      while (cursor < deadline) {
        for (const event of SOS_EVENTS) {
          if (cursor >= deadline) break;
          const eventEnd = Math.min(
            cursor + event.units * DOT_SECONDS,
            deadline,
          );

          if (event.isOn) {
            const fade = Math.min(0.008, (eventEnd - cursor) / 3);
            gain.gain.setValueAtTime(0, cursor);
            gain.gain.linearRampToValueAtTime(0.28, cursor + fade);
            if (eventEnd - cursor > fade * 2) {
              gain.gain.setValueAtTime(0.28, eventEnd - fade);
            }
            gain.gain.linearRampToValueAtTime(0, eventEnd);
          } else {
            gain.gain.setValueAtTime(0, cursor);
            gain.gain.setValueAtTime(0, eventEnd);
          }
          cursor = eventEnd;
        }
      }

      const session = { context, oscillator, gain };
      audioSession = session;
      oscillator.onended = () => {
        finishAudioSession(session, "audioComplete");
      };
      oscillator.start(startTime);
      oscillator.stop(deadline);
      setAudioStatus("audioRunning");
      updateTestControls();
    } catch {
      if (audioSession) stopAudio();
      if (context) context.close().catch(() => {});
      setAudioStatus("audioError");
      updateTestControls();
    }
  }

  function waitUntil(deadline) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, deadline - performance.now()));
    });
  }

  function stopFlash(statusKey = "flashStopped") {
    if (!flashRunning) return;
    flashRunToken += 1;
    flashRunning = false;
    opticalStage.classList.remove("is-on");
    setFlashStatus(statusKey);
    updateTestControls();
  }

  async function startFlash() {
    stopFlash();
    flashRunning = true;
    const token = ++flashRunToken;
    const deadline = performance.now() + TEST_LIMIT_MILLISECONDS;
    let cursor = performance.now();
    setFlashStatus("flashRunning");
    updateTestControls();

    while (flashRunning && token === flashRunToken && cursor < deadline) {
      for (const event of SOS_EVENTS) {
        if (!flashRunning || token !== flashRunToken || cursor >= deadline) {
          break;
        }
        opticalStage.classList.toggle("is-on", event.isOn);
        cursor = Math.min(
          cursor + event.units * DOT_MILLISECONDS,
          deadline,
        );
        await waitUntil(cursor);
      }
    }

    if (flashRunning && token === flashRunToken) {
      stopFlash("flashComplete");
    }
  }

  function requestFlashStart() {
    if (typeof flashDialog.showModal === "function") {
      flashDialog.returnValue = "";
      flashDialog.showModal();
      return;
    }
    if (window.confirm(translated("flashWarning"))) {
      startFlash();
    }
  }

  function stopAllTests() {
    stopAudio();
    stopFlash();
  }

  startAudioButton.addEventListener("click", startAudio);
  stopAudioButton.addEventListener("click", () => stopAudio());
  requestFlashButton.addEventListener("click", requestFlashStart);
  stopFlashButton.addEventListener("click", () => stopFlash());
  stopAllButton.addEventListener("click", stopAllTests);
  flashDialog.addEventListener("close", () => {
    if (flashDialog.returnValue === "confirm") {
      startFlash();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAllTests();
  });
  window.addEventListener("pagehide", stopAllTests);

  updateTestControls();
  setLanguage(preferredLanguage);
})();
