class TimerService {
  getRemainingMs(lock_start, lock_duration) {
    if (!lock_start || !lock_duration) return 0;
    const elapsed = Date.now() - lock_start;
    return Math.max(0, lock_duration - elapsed);
  }

  isExpired(lock_start, lock_duration) {
    return this.getRemainingMs(lock_start, lock_duration) === 0;
  }

  formatRemaining(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;

    return {
      ms,
      seconds: totalSec,
      display: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
      critical: ms < 60000,
    };
  }
}

module.exports = new TimerService();