let darkMode = false;

document.addEventListener('DOMContentLoaded', () => {
    displayTopCommenters(comments);
});

// Store the commenter data
let chart;
let interactionChart;
let currentChart;

const startLoading = function () {
    document.getElementById('loader').style.display = '';
}
const stopLoading = function () {
    document.getElementById('loader').style.display = 'none';
}

// Function to render the table with sorted data
function renderTable() {
    const tableBody = document.querySelector('#commenters-table tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    Object.keys(commenters).forEach((user, index) => {
        const data = commenters[user];
        const row = document.createElement('tr');

        row.innerHTML = `
                <td onclick="expandUser('${user}')"><b>#${(index + 1).toLocaleString('en-US')}</b> ${data.name}</td>
                <td>${data.commentsG.toLocaleString('en-US')}</td>
                <td>${data.repliesG.toLocaleString('en-US')}</td>
                <td>${data.interactions.toLocaleString('en-US')}</td>
                <td>${data.likesR.toLocaleString('en-US')}</td>
                <td>${data.repliesR.toLocaleString('en-US')}</td>
                <td>${new Date(data.firstC).toLocaleString()}</td>
                <td>${data.firstR ? new Date(data.firstR).toLocaleString() : 'N/A'}</td>
                <td>${new Date(data.lastC).toLocaleString()}</td>
                <td>${data.lastR ? new Date(data.lastR).toLocaleString() : 'N/A'}</td>
            `;
        tableBody.appendChild(row);
    });
    stopLoading()
}


// Function to sort the table data based on the clicked column
let lastSort = "";
let sortDirection = {};

function sortValues(property) {
    startLoading()
    let reverse = false;

    // Check if the same property is clicked again to reverse the sort direction
    if (lastSort === property) {
        reverse = true;
        sortDirection[property] = !sortDirection[property]; // Toggle the direction
    } else {
        // Reset the background color of the previous sort column
        if (lastSort !== "") {
            document.getElementById("sort_" + lastSort).style.backgroundColor = darkMode ? '#222' : '#f2f2f2';
        }

        // Set the background color of the new sort column
        document.getElementById('sort_' + property).style.backgroundColor = darkMode ? '#141414' : '#FFF';

        // Set the new sorting direction for the clicked property
        sortDirection[property] = true; // Default to ascending order
        lastSort = property;
    }

    // Sort the data based on the selected property and direction
    let sortedData = Object.values(commenters).sort((a, b) => {
        if (property === 'name') {
            return sortDirection[property] ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else if (property === 'commentsG' || property === 'repliesG' || property === 'interactions' || property === 'likesR' || property === 'repliesR') {
            return sortDirection[property] ? b[property] - a[property] : a[property] - b[property]; // Toggle order
        } else if (property === 'firstC' || property === 'lastC' || property === 'firstR' || property === 'lastR') {
            return sortDirection[property] ? new Date(a[property]) - new Date(b[property]) : new Date(b[property]) - new Date(a[property]); // Toggle date order
        }
    });

    // Re-render the table with sorted data
    commenters = sortedData.reduce((acc, data) => {
        acc[data.id] = data;
        return acc;
    }, {});

    renderTable();
}

function expandUser(userId) {
    startLoading();
    if (currentChart) {
        currentChart.destroy();
    }
    const user = commenters[userId];

    // Populate the user profile with data
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-comments').textContent = user.commentsG;
    document.getElementById('user-replies').textContent = user.repliesG;
    document.getElementById('user-interactions').textContent = user.interactions;
    document.getElementById('user-likes').textContent = user.likesR;
    document.getElementById('user-replies-received').textContent = user.repliesR;
    document.getElementById('user-first-comment').textContent = new Date(user.firstC).toLocaleString();
    document.getElementById('user-last-comment').textContent = new Date(user.lastC).toLocaleString();
    document.getElementById('user-first-reply').textContent = user.firstR ? new Date(user.firstR).toLocaleString() : 'N/A';
    document.getElementById('user-last-reply').textContent = user.lastR ? new Date(user.lastR).toLocaleString() : 'N/A';

    // Show all comments and replies
    const allCommentsSection = document.getElementById('user-all-comments');
    const allRepliesSection = document.getElementById('user-all-replies');

    // Clear previous content
    allCommentsSection.innerHTML = '';
    allRepliesSection.innerHTML = '';

    // Display all comments
    user.allComments.forEach(comment => {
        let text = comment.textDisplay;
        const commentElement = document.createElement('div');
        commentElement.classList.add('comment')
        commentElement.innerHTML = `
        <h3 class="comment-name">${comment.authorDisplayName}</h3>
        <p class="comment-text">${text}</p>
        <h6 class="comment-likes">${comment.likeCount} like${comment.likeCount === 1 ? '' : 's'} - ${comment.publishedAt}</h6>
        <hr>`;
        allCommentsSection.appendChild(commentElement);
    });

    // Display all replies
    user.allReplies.forEach(reply => {
        let text = reply.textDisplay;
        const commentElement = document.createElement('div');
        commentElement.classList.add('comment')
        commentElement.innerHTML = `
        <h3 class="comment-name">${reply.authorDisplayName}</h3>
        <p class="comment-text">${text}</p>
        <h6 class="comment-likes">${reply.likeCount} like${reply.likeCount === 1 ? '' : 's'} - ${reply.publishedAt}</h6>
        <hr>`;
        allRepliesSection.appendChild(commentElement);
    });

    document.getElementById('user-profile').style.display = '';
    createTotalsGraph(user);
    createUserInteractionMap(user);

    //scroll to "user-profile"
    $([document.documentElement, document.body]).animate({
        scrollTop: $("#user-profile").offset().top
    }, 2000);
    stopLoading()
};

function createUserInteractionMap(user) {
    const interactionCounts = {};

    comments.forEach(topLevelComment => {
        user.allReplies.forEach(reply => {
            if (topLevelComment.topLevelComment.id == reply.parentId) {
                interactionCounts[topLevelComment.topLevelComment.snippet.authorChannelId.value] = {
                    name: topLevelComment.topLevelComment.snippet.authorDisplayName,
                    count: interactionCounts[topLevelComment.topLevelComment.snippet.authorChannelId.value]
                        ? interactionCounts[topLevelComment.topLevelComment.snippet.authorChannelId.value].count + 1
                        : 1
                };
            }
        });
    });

    // Sort interactionCounts by count in descending order
    const sortedInteractions = Object.entries(interactionCounts)
        .sort(([, a], [, b]) => b.count - a.count) // Compare by count
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});

    console.log(sortedInteractions);
    document.getElementById('uniqueReplyPeople').textContent = Object.keys(sortedInteractions).length + " users."

    // Prepare data for the pie chart
    const labels = [];
    const data = [];

    Object.values(sortedInteractions).forEach(interaction => {
        labels.push(interaction.name);
        data.push(interaction.count);
    });

    // Create the pie chart
    const ctx = document.getElementById('interactionChart').getContext('2d');
    if (interactionChart) {
        interactionChart.destroy();
    }
    interactionChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'User Interactions',
                data: data,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                    'rgba(54, 162, 235, 0.2)',
                    'rgba(255, 206, 86, 0.2)',
                    'rgba(75, 192, 192, 0.2)',
                    'rgba(153, 102, 255, 0.2)',
                    'rgba(255, 159, 64, 0.2)',
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(255, 159, 64, 1)',
                ],
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value} interactions`;
                        },
                    },
                },
            },
        },
    });
}

function createTotalsGraph(user) {
    let totalComments = 0;
    let totalReplies = 0;
    let comments = [];
    let replies = [];

    let firstAction = new Date(user.firstC).getTime() > new Date(user.firstR).getTime()
        ? new Date(user.firstR).getTime()
        : new Date(user.firstC).getTime();

    let lastAction = new Date(user.lastC).getTime() < new Date(user.lastR).getTime()
        ? new Date(user.lastR).getTime()
        : new Date(user.lastC).getTime();

    const labels = generateAllDays(firstAction, lastAction);

    // Create maps for quick date lookup
    const commentMap = {};
    const replyMap = {};

    user.allComments.forEach(comment => {
        const date = new Date(comment.publishedAt).toISOString().split('T')[0];
        commentMap[date] = (commentMap[date] || 0) + 1;
    });

    user.allReplies.forEach(reply => {
        const date = new Date(reply.publishedAt).toISOString().split('T')[0];
        replyMap[date] = (replyMap[date] || 0) + 1;
    });

    labels.forEach(date => {
        totalComments += commentMap[date] || 0; // Add the count for this date or 0 if none
        totalReplies += replyMap[date] || 0; // Add the count for this date or 0 if none
        comments.push(totalComments);
        replies.push(totalReplies);
    });

    const data = {
        labels: labels,
        datasets: [{
            label: 'Total Comments',
            data: comments,
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1
        }, {
            label: 'Total Replies',
            data: replies,
            fill: false,
            borderColor: 'rgb(255, 128, 128)',
            tension: 0.1
        }]
    };

    if (chart) {
        chart.destroy()
    }

    chart = new Chart(
        document.getElementById('engagementChart'),
        {
            type: 'line',
            data: data,
        }
    )
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    darkMode = !darkMode;
}

function exportData(format) {
    let data;
    if (format === 'csv') {
        data = 'Name,Comments Given,Replies Given,Interactions,Likes Received,Replies Received\n';
        Object.values(commenters).forEach(user => {
            data += `${user.name},${user.commentsG},${user.repliesG},${user.interactions},${user.likesR},${user.repliesR}\n`;
        });
        const blob = new Blob([data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'commenters.csv';
        a.click();
    } else if (format === 'json') {
        data = JSON.stringify(commenters, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'commenters.json';
        a.click();
    };
};

function createEngagementOverTimeChart(commentsData) {
    const engagementMap = {};
    commentsData.forEach(comment => {
        const date = comment.topLevelComment.snippet.publishedAt.split('T')[0];
        engagementMap[date] = (engagementMap[date] || 0) + 1;
        comment.replies.forEach(reply => {
            const replyDate = reply.publishedAt.split('T')[0];
            engagementMap[replyDate] = (engagementMap[replyDate] || 0) + 1;
        });
    });

    const labels = Object.keys(engagementMap).sort();
    const data = labels.map(date => engagementMap[date]);

    const ctx = document.getElementById('engagementOverTimeChart').getContext('2d');
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Comments & Replies',
                data: data,
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
            }],
        },
        options: {
            scales: {
                x: { type: 'time', time: { unit: 'day' } },
                y: { beginAtZero: true },
            },
        },
    });
    stopLoading();
};

createEngagementOverTimeChart(comments)

function createBarChartRaceData(comments) {
    const oldestCommentTime = new Date(Math.min(...comments.map(item => new Date(item.topLevelComment.snippet.publishedAt).getTime())));
    const newestCommentTime = new Date(Math.max(...comments.map(item => new Date(item.topLevelComment.snippet.publishedAt).getTime())));

    const labels = generateAllDays(oldestCommentTime, newestCommentTime);
    let realUsers = [];
    Object.values(commenters).forEach(user => {
        realUsers.push({
            name: user.name,
            image: user.image,
            daily: new Array(labels.length).fill(0), // Initialize daily counts with 0
        });
    });

    // Count comments per day
    comments.forEach(comment => {
        const publishedAt = comment.topLevelComment.snippet.publishedAt.split('T')[0];
        const labelIndex = labels.indexOf(publishedAt);

        if (labelIndex !== -1) { // Ensure the comment date is within the labels range
            realUsers.forEach(user => {
                if (comment.topLevelComment.snippet.authorDisplayName === user.name) {
                    user.daily[labelIndex] += 1; // Increment only for the specific day
                }
            });
        }

        comment.replies.forEach(reply => {
            if (labelIndex !== -1) {
                realUsers.forEach(user => {
                    if (reply.authorDisplayName === user.name) {
                        user.daily[labelIndex] += 1; // Increment only for the specific day
                    }
                });
            }
        });
    });

    // Calculate cumulative totals
    realUsers.forEach(user => {
        for (let i = 1; i < user.daily.length; i++) {
            user.daily[i] += user.daily[i - 1];
        }
    });

    return { realUsers, labels };
}


async function firstLoad() {
    await displayTopCommenters(comments);
    renderTable();

    document.getElementById('comments').textContent = totalComments.toLocaleString('en-US');
    document.getElementById('replies').textContent = totalReplies.toLocaleString('en-US');
    document.getElementById('likes').textContent = totalLikes.toLocaleString('en-US');
    document.getElementById('totalPosts').textContent = (totalComments + totalReplies).toLocaleString('en-US');
}

firstLoad();