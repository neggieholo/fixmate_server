export default function calculateTaskDates(startDate, frequency) {
    let last_task_date;
    let next_task_date;
    const now = new Date();

    const addFrequency = (date, freq) => {
        const d = new Date(date);
        switch (freq) {
            case "Daily":
                d.setDate(d.getDate() + 1);
                break;
            case "Weekly":
                d.setDate(d.getDate() + 7);
                break;
            case "Every 2 Weeks":
                d.setDate(d.getDate() + 14);
                break;
            case "Monthly":
                d.setMonth(d.getMonth() + 1);
                break;
            case "Quarterly":
                d.setMonth(d.getMonth() + 3);
                break;
            case "Yearly":
                d.setFullYear(d.getFullYear() + 1);
                break;
            default:
                break;
        }
        return d;
    };

    if (!["Daily", "Weekly", "Every 2 Weeks", "Monthly", "Quarterly", "Yearly"].includes(frequency)) {
        return { last_task_date: startDate, next_task_date: startDate };
    }

    let last = new Date(startDate);
    while (addFrequency(last, frequency).getTime() <= now.getTime()) {
        last = addFrequency(last, frequency);
    }

    const next = addFrequency(last, frequency);
    return { last_task_date: last, next_task_date: next };
}
