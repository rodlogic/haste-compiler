all: sendfile sendfile.js

sendfile.js: sendfile.hs
	hastec sendfile.hs

sendfile:
	cabal sandbox init --sandbox=../../.cabal-sandbox
	cabal install

clean:
	-cabal clean
	-rm -r main
	-rm *~
	-rm sendfile.hi
	-rm sendfile.o

distclean: clean
	-cabal clean
	-rm sendfile.js

