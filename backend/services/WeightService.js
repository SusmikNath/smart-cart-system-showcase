class WeightService {
  getTolerance(expectedWeight) {
    const expected = Number(expectedWeight || 0);

    // Demo-friendly hardware tolerance
    if (expected <= 250) return 20;
    if (expected <= 1000) return 35;
    return 50;
  }

  check(expectedWeight, actualWeight) {
    const expected = Number(expectedWeight || 0);
    const actual = Number(actualWeight || 0);
    const difference = Math.abs(actual - expected);
    const tolerance = this.getTolerance(expected);
    const matched = difference <= tolerance;

    return {
      expected_weight: expected,
      actual_weight: actual,
      difference,
      tolerance,
      matched,
      status: matched ? "OK" : "MISMATCH"
    };
  }
}

module.exports = new WeightService();