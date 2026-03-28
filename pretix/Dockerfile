FROM pretix/standalone:2024.7.1
USER root
RUN pip3 install pretix-zugferd==2.2.1 pretix-sofort==1.4.1 pretix-bitpay==1.5.2 pretix-servicefees==1.12.0 pretix-pages==1.6.1 pretix-fontpack-free==1.11.0 pretix-bounces==1.5.0 pretix-passbook==1.13.2
RUN rm -rf ~/.cache/pip
USER pretixuser
RUN cd /pretix/src && make production
