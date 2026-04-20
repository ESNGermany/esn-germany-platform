FROM pretix/standalone:2026.1.2
USER root
RUN pip3 install pretix-zugferd==2.6.3 pretix-sofort==1.4.1 pretix-bitpay==1.5.2 pretix-servicefees==1.15.0 pretix-pages==1.6.3 pretix-fontpack-free==1.11.0 pretix-bounces==1.5.1 pretix-passbook==1.14.1
RUN rm -rf ~/.cache/pip
USER pretixuser
RUN cd /pretix/src && make production
