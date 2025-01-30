function updateTimestamps(commenter, timestamp, type) {
    if (type === "comment") {
        if (!commenter.firstC || timestamp < commenter.firstC) {
            commenter.firstC = timestamp;
        }
        if (!commenter.lastC || timestamp > commenter.lastC) {
            commenter.lastC = timestamp;
        }
    } else if (type === "reply") {
        if (!commenter.firstR || timestamp < commenter.firstR) {
            commenter.firstR = timestamp;
        }
        if (!commenter.lastR || timestamp > commenter.lastR) {
            commenter.lastR = timestamp;
        }
    }
}