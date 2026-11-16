const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const millisecondsPerDay = 24 * 60 * 60 * 1000;

const daysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / millisecondsPerDay));
};

const driver = (name, value, severity, message) => ({ name, value, severity, message });

export function assessProject(project, now = new Date()) {
  const budget = Math.max(toNumber(project.budget), 0);
  const spent = Math.max(toNumber(project.spent), 0);
  const plannedProgress = clamp(toNumber(project.plannedProgress), 0, 100);
  const actualProgress = clamp(toNumber(project.actualProgress), 0, 100);
  const financialProgress = clamp(toNumber(project.financialProgress, budget ? (spent / budget) * 100 : 0), 0, 100);
  const totalMilestones = Math.max(toNumber(project.totalMilestones, 1), 1);
  const delayedMilestones = clamp(toNumber(project.delayedMilestones), 0, totalMilestones);
  const progressGap = Math.max(0, plannedProgress - actualProgress);
  const budgetUsed = budget > 0 ? (spent / budget) * 100 : 0;
  const daysTotal = daysBetween(project.startDate, project.endDate);
  const daysElapsed = daysBetween(project.startDate, now);
  const daysRemaining = Math.max(0, daysBetween(now, project.endDate));
  const timelineElapsed = daysTotal > 0 ? clamp((daysElapsed / daysTotal) * 100, 0, 100) : 0;
  const scheduleGap = Math.max(0, timelineElapsed - plannedProgress);
  const milestoneRatio = (delayedMilestones / totalMilestones) * 100;
  const costVsPhysicalGap = financialProgress - actualProgress;
  const status = project.status || 'Active';

  const progressScore = progressGap * 0.35;
  const costScore = clamp(Math.max(budgetUsed, financialProgress), 0, 100) * 0.25;
  const scheduleScore = scheduleGap * 0.25;
  const milestoneScore = milestoneRatio * 0.15;
  let riskScore = clamp(Math.round(progressScore + costScore + scheduleScore + milestoneScore), 0, 100);

  if (['Completed', 'Cancelled'].includes(status)) riskScore = 0;
  const riskLevel = riskScore >= 61 ? 'High' : riskScore >= 31 ? 'Medium' : 'Low';
  const severityFor = (value, mediumAt, highAt) => value >= highAt ? 'High' : value >= mediumAt ? 'Medium' : 'Low';
  const riskDrivers = [];

  if (progressGap > 5) {
    riskDrivers.push(driver('Progress Gap', progressGap, severityFor(progressGap, 10, 20),
      `Actual progress is ${progressGap.toFixed(0)} percentage points behind the ${plannedProgress.toFixed(0)}% plan.`));
  }
  if (budgetUsed > 70 || costVsPhysicalGap > 15) {
    const message = costVsPhysicalGap > 15
      ? `Financial progress (${financialProgress.toFixed(0)}%) is ${costVsPhysicalGap.toFixed(0)} points ahead of physical progress. Review the variance; it is not by itself evidence of misuse.`
      : `Expenditure is ${budgetUsed.toFixed(0)}% of the approved budget.`;
    riskDrivers.push(driver('Cost Pressure', Math.round(Math.max(budgetUsed, costVsPhysicalGap)), severityFor(Math.max(budgetUsed, costVsPhysicalGap), 70, 90), message));
  }
  if (scheduleGap > 5 || (daysRemaining === 0 && !['Completed', 'Cancelled'].includes(status) && actualProgress < 100)) {
    const severity = daysRemaining === 0 ? 'High' : severityFor(scheduleGap, 10, 20);
    riskDrivers.push(driver('Schedule Pressure', Math.round(scheduleGap), severity,
      daysRemaining === 0
        ? `The planned completion date has passed with ${actualProgress.toFixed(0)}% physical progress recorded.`
        : `The timeline is ${scheduleGap.toFixed(0)} percentage points ahead of planned progress.`));
  }
  if (delayedMilestones > 0) {
    riskDrivers.push(driver('Delayed Milestones', delayedMilestones, severityFor(milestoneRatio, 20, 40),
      `${delayedMilestones} of ${totalMilestones} milestones are delayed (${milestoneRatio.toFixed(0)}%).`));
  }
  if (costVsPhysicalGap > 15 && !riskDrivers.some((item) => item.name === 'Cost Pressure')) {
    riskDrivers.push(driver('Financial / Physical Variance', Math.round(costVsPhysicalGap), severityFor(costVsPhysicalGap, 20, 35),
      `Financial progress is ${costVsPhysicalGap.toFixed(0)} percentage points ahead of physical progress. Verify the reported figures and work completed.`));
  }

  if (riskDrivers.length === 0) {
    riskDrivers.push(driver('Current Indicators', 0, 'Low', 'No material pressure was detected by the prototype rules using the available project data.'));
  }

  const recommendedReview = [];
  if (riskDrivers.some((item) => item.name === 'Progress Gap')) recommendedReview.push('Verify current site progress against the approved plan.');
  if (riskDrivers.some((item) => item.name === 'Schedule Pressure')) recommendedReview.push('Review the completion schedule and recovery milestones.');
  if (riskDrivers.some((item) => item.name === 'Delayed Milestones')) recommendedReview.push('Confirm ownership and revised dates for delayed milestones.');
  if (riskDrivers.some((item) => item.name.includes('Cost') || item.name.includes('Financial'))) {
    recommendedReview.push('Reconcile expenditure with certified work and physical progress.');
  }
  if (riskDrivers.some((item) => item.name === 'Progress Gap') && project.contractor) {
    recommendedReview.push(`Review contractor delivery with ${project.contractor}.`);
  }
  if (!recommendedReview.length) recommendedReview.push('Continue routine monitoring and update the record after the next inspection.');

  const riskSummary = `Current prototype rule-based risk is ${riskScore}/100 (${riskLevel}). Physical progress is ${actualProgress.toFixed(0)}% against a ${plannedProgress.toFixed(0)}% plan; financial progress is ${financialProgress.toFixed(0)}%.`;
  const milestoneCompletion = Math.round((toNumber(project.completedMilestones) / totalMilestones) * 100);
  const scheduleSlippageDays = Math.max(
    toNumber(project.delayDays),
    daysRemaining === 0 && actualProgress < 100 && !['Completed', 'Cancelled'].includes(status)
      ? Math.max(0, Math.round((now - new Date(project.endDate)) / millisecondsPerDay))
      : 0,
  );

  return {
    budgetUsed: Math.round(budgetUsed),
    progressGap: Math.round(progressGap),
    financialProgress: Math.round(financialProgress),
    costVsPhysicalGap: Math.round(costVsPhysicalGap),
    timelineElapsed: Math.round(timelineElapsed),
    daysRemaining,
    scheduleSlippageDays,
    milestoneCompletion,
    riskScore,
    riskLevel,
    riskDrivers,
    recommendedReview,
    riskSummary,
  };
}
