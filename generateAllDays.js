const generateAllDays = function (first, last) {
    const days = [];
    let currentDate = new Date(first);

    // Loop until we reach or pass the last date
    while (currentDate.getTime() <= last) {
        days.push(currentDate.toISOString().split('T')[0]); // Format as YYYY-MM-DD
        currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
    }

    return days;
};