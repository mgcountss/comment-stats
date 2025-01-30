let totalComments = 0;
let totalReplies = 0;
let totalLikes = 0;
let oldestCommentTime = 0;
let newestCommentTime = 0;
let commenters = {};

function removeDuplicates(array) {
    const uniqueItems = new Map();
    return array.filter(item => {
        const id = item.id || item.publishedAt; // Use ID if available, fallback to timestamp
        if (uniqueItems.has(id)) {
            return false;
        }
        uniqueItems.set(id, true);
        return true;
    });
}

function displayTopCommenters(commentsData) {
    return new Promise((resolve, reject) => {
        commentsData.forEach(comment => {
            // Track the oldest and newest comment timestamps
            const commentTime = new Date(comment.topLevelComment.snippet.publishedAt).getTime();
            if (oldestCommentTime === 0 || commentTime < oldestCommentTime) {
                oldestCommentTime = commentTime;
            }
            if (commentTime > newestCommentTime) {
                newestCommentTime = commentTime;
            }

            totalComments++;

            // Process the top-level comment
            const commenterId = comment.topLevelComment.snippet.authorChannelId.value;
            if (!commenters[commenterId]) {
                commenters[commenterId] = initializeCommenter(comment.topLevelComment.snippet);
            }

            // Update top-level comment counts
            const commenter = commenters[commenterId];
            commenter.commentsG++;
            commenter.interactions++;
            commenter.likesR += comment.topLevelComment.snippet.likeCount;
            totalLikes += comment.topLevelComment.snippet.likeCount;
            commenter.allComments.push(comment.topLevelComment.snippet);

            // Update first and last comment timestamps
            updateTimestamps(commenter, comment.topLevelComment.snippet.publishedAt, "comment");

            // Process replies
            if (comment.replies && comment.replies.length > 0) {
                comment.replies.forEach(reply => {
                    totalReplies++;

                    const replyTime = new Date(reply.publishedAt).getTime();
                    if (replyTime > newestCommentTime) {
                        newestCommentTime = replyTime;
                    }

                    const replyAuthorId = reply.authorChannelId.value;
                    if (!commenters[replyAuthorId]) {
                        commenters[replyAuthorId] = initializeCommenter(reply);
                    }

                    const replyAuthor = commenters[replyAuthorId];
                    replyAuthor.repliesG++;
                    replyAuthor.interactions++;
                    replyAuthor.likesR += reply.likeCount;
                    totalLikes += reply.likeCount;
                    replyAuthor.allReplies.push(reply);

                    // Update first and last reply timestamps
                    updateTimestamps(replyAuthor, reply.publishedAt, "reply");

                    // Update the original commenter's received replies count
                    commenter.repliesR++;
                });
            }
        });

        //go through each commenter and remove duplicate comments or replies from allComments or allReplies
        Object.keys(commenters).forEach(commenterId => {
            const commenter = commenters[commenterId];
            commenter.allComments = removeDuplicates(commenter.allComments);
            commenter.allReplies = removeDuplicates(commenter.allReplies);
            commenter.likes = commenter.likes/2;
        });

        // Update the total number of comments and replies
        totalComments = Object.keys(commenters).length;
        totalReplies = Object.keys(commenters).reduce((acc, id) => acc + commenters[id].repliesG, 0);
        resolve()
    })
}

// Helper function to initialize a new commenter object
function initializeCommenter(data) {
    return {
        name: data.authorDisplayName,
        image: data.authorProfileImageUrl,
        commentsG: 0,
        repliesG: 0,
        interactions: 0,
        likesR: 0,
        repliesR: 0,
        firstC: null,
        lastC: null,
        firstR: null,
        lastR: null,
        allComments: [],
        allReplies: [],
        id: data.authorChannelId.value,
    };
}
