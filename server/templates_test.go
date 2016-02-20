package server

import (
	"github.com/bakape/meguca/config"
	. "gopkg.in/check.v1"
	"html/template"
)

type Templates struct{}

var _ = Suite(&Templates{})

func (t *Templates) TestBoardNavigation(c *C) {
	config.Config = config.Server{}
	config.Config.Boards.Enabled = []string{"a", "staff"}
	config.Config.Boards.Staff = "staff"
	config.Config.Boards.Psuedo = [][2]string{
		[2]string{"g", "https://google.com"},
	}
	html := boardNavigation()
	c.Assert(
		string(html),
		Equals,
		`<b id="navTop">[`+
			`<a href="../a/">a</a> / `+
			`<a href="../all/">all</a> / `+
			`<a href="https://google.com">g</a>`+
			`]</b>`,
	)
}

func (t *Templates) TestBuildIndexTemplate(c *C) {
	vars := templateVars{
		Config:     template.JS("c()"),
		ConfigHash: "a",
		Navigation: template.HTML("<hr>"),
	}
	tmpl, err := template.New("index").Parse(
		`<script>{{.Config}}</script>` +
			`<b>{{.ConfigHash}}</b>` +
			`{{.Navigation}}` +
			`<script>{{.IsMobile}}</script>`,
	)
	c.Assert(err, IsNil)
	standard := templateStore{
		HTML: []byte("<script>c()</script><b>a</b><hr><script>false</script>"),
		Hash: "d99e2949415f7ec0",
	}
	res := buildIndexTemplate(tmpl, vars, false)
	c.Assert(res, DeepEquals, standard)
}

func (t *Templates) TestCompileTemplates(c *C) {
	templateRoot = "./test"
	config.Config = config.Server{}
	config.ClientConfig = []byte{1}
	config.Config.Boards.Enabled = []string{"a"}
	standard := templateStore{
		HTML: []byte("<a></a>\n"),
		Hash: "eb51aca26e55050a",
	}
	defer func() {
		c.Assert(recover(), IsNil)
	}()
	resources = templateMap{}
	compileTemplates()
	c.Assert(resources["index"], DeepEquals, standard)
	c.Assert(resources["mobile"], DeepEquals, standard)
}
