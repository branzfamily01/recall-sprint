(() => {
  'use strict';

  const STORAGE_KEY = 'recall-sprint-v1';
  const app = document.getElementById('app');
  const navButtons = [...document.querySelectorAll('.nav-btn')];
  const installBtn = document.getElementById('installBtn');
  let deferredPrompt = null;
  let timerId = null;
  let secondsLeft = 60;
  let activeTopicId = null;

  const DAY = 86400000;

  function getState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { topics: [], sessions: [] };
      const parsed = JSON.parse(raw);
      return {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
      };
    } catch {
      return { topics: [], sessions: [] };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return (crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function startOfDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addDays(ts, days) {
    const d = new Date(ts);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function formatDate(ts) {
    return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(ts));
  }

  function ratingMeta(rating) {
    return {
      hard: { emoji: '😵', label: '抜けが多い', next: '明日もう一度' },
      normal: { emoji: '🙂', label: 'まあまあ', next: '3日後にもう一度' },
      easy: { emoji: '😎', label: 'ほぼOK', next: '卒業' }
    }[rating] || { emoji: '•', label: '未評価', next: '' };
  }

  function sessionsToday(state) {
    const today = startOfDay();
    return state.sessions.filter(s => s.at >= today).length;
  }

  function sessionsThisWeek(state) {
    const since = Date.now() - 7 * DAY;
    return state.sessions.filter(s => s.at >= since).length;
  }

  function dueTopics(state) {
    const today = startOfDay();
    return state.topics
      .filter(t => t.status === 'active' && Number.isFinite(t.nextRecallAt) && t.nextRecallAt <= today)
      .sort((a, b) => a.nextRecallAt - b.nextRecallAt);
  }

  function setRoute(route) {
    stopTimer();
    navButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.route === route));
    if (route === 'home') renderHome();
    if (route === 'history') renderHistory();
    if (route === 'about') renderAbout();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navButtons.forEach(btn => btn.addEventListener('click', () => setRoute(btn.dataset.route)));

  function renderHome() {
    const state = getState();
    const due = dueTopics(state);
    app.innerHTML = `
      <section class="hero">
        <p class="eyebrow">ACTIVE RECALLを、習慣に。</p>
        <div class="hero-copy">勉強したら、<br>60秒だけ思い出す。</div>
        <p class="hero-sub">答えは入力しません。教材を閉じて、自分の頭から取り出すための60秒だけをつくります。</p>
        <button id="newRecallBtn" class="start-btn" type="button" aria-label="新しい60秒Recallを始める">
          <span class="plus">＋</span>
          <span>60秒Recall</span>
        </button>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>今日もう一度</h2>
          <p>${due.length ? `${due.length}件` : '再Recallはありません'}</p>
        </div>
        <div class="due-list">
          ${due.length ? due.map(t => {
            const m = ratingMeta(t.rating);
            return `
              <article class="due-card">
                <div class="due-main">
                  <div class="topic">${escapeHtml(t.topic)}</div>
                  <div class="meta"><span class="tag ${t.rating}">${m.emoji} ${m.label}</span></div>
                </div>
                <button class="primary-btn due-recall" data-id="${t.id}" type="button">Recall</button>
              </article>`;
          }).join('') : '<div class="empty">必要なテーマだけ、ここに戻ってきます。</div>'}
        </div>

        <div class="stats">
          <div class="stat-card"><div class="stat-value">${sessionsToday(state)}</div><div class="stat-label">今日のSprint</div></div>
          <div class="stat-card"><div class="stat-value">${sessionsThisWeek(state)}</div><div class="stat-label">直近7日のSprint</div></div>
        </div>
      </section>
    `;

    document.getElementById('newRecallBtn').addEventListener('click', () => renderTopicInput());
    document.querySelectorAll('.due-recall').forEach(btn => btn.addEventListener('click', () => beginRecall(btn.dataset.id)));
  }

  function renderTopicInput() {
    app.innerHTML = `
      <section class="screen-card">
        <div class="back-row"><button class="back-btn" id="backHome" type="button">← ホーム</button></div>
        <p class="prompt-label">いま、何を勉強した？</p>
        <h2 class="recall-title" style="font-size:32px;margin-bottom:8px">テーマだけ入れる</h2>
        <p class="hero-sub">答えやノートは保存しません。</p>
        <input id="topicInput" class="topic-input" maxlength="60" autocomplete="off" placeholder="例：鎌倉幕府 / 助動詞can" />
        <button id="topicStart" class="primary-btn wide" type="button">START</button>
      </section>
    `;
    document.getElementById('backHome').addEventListener('click', renderHome);
    const input = document.getElementById('topicInput');
    const start = () => {
      const topic = input.value.trim();
      if (!topic) { showToast('テーマを1つ入れてください'); input.focus(); return; }
      const state = getState();
      const item = { id: uid(), topic, createdAt: Date.now(), lastRecallAt: null, rating: null, nextRecallAt: null, recallCount: 0, status: 'active' };
      state.topics.unshift(item);
      saveState(state);
      beginRecall(item.id);
    };
    document.getElementById('topicStart').addEventListener('click', start);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
    setTimeout(() => input.focus(), 0);
  }

  function beginRecall(topicId) {
    const state = getState();
    const item = state.topics.find(t => t.id === topicId);
    if (!item) return renderHome();
    activeTopicId = topicId;
    secondsLeft = 60;
    renderTimer(item);
    startTimer();
  }

  function renderTimer(item) {
    app.innerHTML = `
      <section class="screen-card">
        <p class="prompt-label">教材を閉じよう</p>
        <h2 class="recall-title">${escapeHtml(item.topic)}</h2>
        <div class="timer-wrap" aria-label="60秒タイマー">
          <div id="timerRing" class="timer-ring" style="--progress:100"></div>
          <div id="timerNum" class="timer-num">60</div>
        </div>
        <p class="timer-hint">覚えていることを、できるだけ全部思い出そう。</p>
        <div class="mic-note">声に出す・頭の中で言う・紙に書く。好きな方法でOK。アプリには答えを入力しません。</div>
        <button id="finishNow" class="secondary-btn wide" style="margin-top:18px" type="button">思い出せたので確認へ</button>
      </section>
    `;
    document.getElementById('finishNow').addEventListener('click', () => finishRecall());
  }

  function startTimer() {
    stopTimer();
    timerId = window.setInterval(() => {
      secondsLeft -= 1;
      const num = document.getElementById('timerNum');
      const ring = document.getElementById('timerRing');
      if (num) num.textContent = secondsLeft;
      if (ring) ring.style.setProperty('--progress', (secondsLeft / 60) * 100);
      if (secondsLeft <= 0) finishRecall();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function finishRecall() {
    stopTimer();
    if (!activeTopicId) return renderHome();
    const state = getState();
    const item = state.topics.find(t => t.id === activeTopicId);
    if (!item) return renderHome();
    renderRating(item);
  }

  function renderRating(item) {
    app.innerHTML = `
      <section class="screen-card">
        <p class="prompt-label">教材を開いて確認しよう</p>
        <h2 class="recall-title" style="font-size:34px">${escapeHtml(item.topic)}</h2>
        <p class="hero-sub">どれくらい思い出せた？</p>
        <div class="ratings">
          <button class="rating-btn hard" data-rating="hard" type="button">
            <span class="emoji">😵</span><span><strong>抜けが多い</strong><small>明日もう一度</small></span>
          </button>
          <button class="rating-btn normal" data-rating="normal" type="button">
            <span class="emoji">🙂</span><span><strong>まあまあ</strong><small>3日後にもう一度</small></span>
          </button>
          <button class="rating-btn easy" data-rating="easy" type="button">
            <span class="emoji">😎</span><span><strong>ほぼOK</strong><small>このテーマは卒業</small></span>
          </button>
        </div>
      </section>
    `;
    document.querySelectorAll('.rating-btn').forEach(btn => btn.addEventListener('click', () => saveRating(item.id, btn.dataset.rating)));
  }

  function saveRating(topicId, rating) {
    const state = getState();
    const item = state.topics.find(t => t.id === topicId);
    if (!item) return renderHome();
    const now = Date.now();
    item.lastRecallAt = now;
    item.rating = rating;
    item.recallCount = (item.recallCount || 0) + 1;
    if (rating === 'hard') item.nextRecallAt = addDays(now, 1);
    if (rating === 'normal') item.nextRecallAt = addDays(now, 3);
    if (rating === 'easy') { item.nextRecallAt = null; item.status = 'graduated'; }
    state.sessions.unshift({ id: uid(), topicId, topic: item.topic, rating, at: now });
    saveState(state);
    activeTopicId = null;
    const meta = ratingMeta(rating);
    app.innerHTML = `
      <section class="screen-card">
        <div style="font-size:58px">${meta.emoji}</div>
        <h2 class="recall-title" style="font-size:34px;margin-bottom:8px">Sprint完了</h2>
        <p class="hero-sub">${escapeHtml(item.topic)}</p>
        <div class="result-banner">${meta.next}</div>
        <button id="doneHome" class="primary-btn wide" style="margin-top:18px" type="button">ホームへ</button>
      </section>
    `;
    document.getElementById('doneHome').addEventListener('click', renderHome);
  }

  function renderHistory() {
    const state = getState();
    const sessions = state.sessions.slice(0, 80);
    app.innerHTML = `
      <section>
        <div class="section-head"><h2>Recall履歴</h2><p>${state.sessions.length} Sprint</p></div>
        <div class="history-list">
          ${sessions.length ? sessions.map(s => {
            const m = ratingMeta(s.rating);
            const topic = state.topics.find(t => t.id === s.topicId);
            return `
            <article class="history-card">
              <div class="history-top"><div class="history-title">${escapeHtml(s.topic)}</div><div class="history-date">${formatDate(s.at)}</div></div>
              <div class="history-bottom"><span class="tag ${s.rating}">${m.emoji} ${m.label}</span><span class="history-count">${topic?.recallCount || 1}回Recall</span></div>
            </article>`;
          }).join('') : '<div class="empty">まだ履歴はありません。最初の60秒を始めてみよう。</div>'}
        </div>
      </section>
    `;
  }

  function renderAbout() {
    app.innerHTML = `
      <section class="info-card principle">
        <p class="eyebrow">このアプリの核</p>
        <h2>答えを入力しない。</h2>
        <p>Recall Sprintは教材管理アプリではありません。勉強した直後に「見ずに思い出す」60秒をつくるだけです。</p>
      </section>
      <section class="info-card">
        <h3>使い方</h3>
        <ol>
          <li>勉強がひと区切りついたら「60秒Recall」。</li>
          <li>テーマだけ入力し、教材を閉じる。</li>
          <li>60秒、知っていることを全部思い出す。</li>
          <li>教材を開き、😵 / 🙂 / 😎で自己評価。</li>
          <li>必要なテーマだけ後日もう一度。</li>
        </ol>
      </section>
      <section class="info-card">
        <h3>再Recallのルール</h3>
        <ul>
          <li>😵 抜けが多い → 翌日</li>
          <li>🙂 まあまあ → 3日後</li>
          <li>😎 ほぼOK → 卒業</li>
        </ul>
      </section>
      <section class="info-card">
        <h3>データについて</h3>
        <p>テーマ・自己評価・Recall日時だけを、この端末のブラウザ内に保存します。教材本文や答えは保存しません。</p>
        <div class="danger-zone">
          <button id="resetData" class="danger-btn" type="button">この端末の記録をすべて削除</button>
        </div>
      </section>
    `;
    document.getElementById('resetData').addEventListener('click', () => {
      if (confirm('Recall Sprintの記録をすべて削除しますか？')) {
        localStorage.removeItem(STORAGE_KEY);
        showToast('記録を削除しました');
        renderAbout();
      }
    });
  }

  function showToast(message) {
    const template = document.getElementById('toastTemplate');
    const toast = template.content.firstElementChild.cloneNode(true);
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 1800);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => { installBtn.hidden = true; deferredPrompt = null; });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }

  renderHome();
})();
