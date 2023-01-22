document.getElementById('nav-toggle').addEventListener('click',function(e){
    document.querySelector('nav').classList.toggle('visible') 
})

var article = document.querySelector('article:not(.preview)');
if(article){
    var headings = article.querySelectorAll('h2, h3, h4, h5, h6');
    headings.forEach(function(heading){
        if(heading.id){
            var text = heading.innerHTML;
            var id = heading.id;

            var a = document.createElement('a');
            a.innerHTML = '<svg width="24" height="24" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 7a1 1 0 0 1 .117 1.993L9 9H7a3 3 0 0 0-.176 5.995L7 15h2a1 1 0 0 1 .117 1.993L9 17H7a5 5 0 0 1-.217-9.995L7 7h2Zm8 0a5 5 0 0 1 .217 9.995L17 17h-2a1 1 0 0 1-.117-1.993L15 15h2a3 3 0 0 0 .176-5.995L17 9h-2a1 1 0 0 1-.117-1.993L15 7h2ZM7 11h10a1 1 0 0 1 .117 1.993L17 13H7a1 1 0 0 1-.117-1.993L7 11h10H7Z"/></svg>';
            a.href = '#'+id;

            heading.innerHTML = '';

            heading.appendChild(a);
            heading.appendChild(document.createTextNode(text));
        }
    });
}